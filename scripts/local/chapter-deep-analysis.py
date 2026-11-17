#!/usr/bin/env python3
"""逐章深度拆书：读知识库文档的章节，逐章调 LLM 产出可复用的写法拆解。

用法：
  python3 scripts/local/chapter-deep-analysis.py --doc <documentId> --limit 50
  python3 scripts/local/chapter-deep-analysis.py --doc <documentId> --limit 2 --out /tmp/sample.md

已拆过的章节会记录在进度文件里，重跑自动跳过（断点续跑）。
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import urllib.request

DB = os.path.join(os.path.dirname(__file__), "..", "..", "server", "dev.db")

SYSTEM_PROMPT = """你是网文拆书专家，服务对象是靠写作吃饭的作者。你的拆解必须具体、可操作、能直接复用。

硬性要求：
1. 只说本章实际发生的东西，禁止复述大段剧情，禁止空泛总结（"情节紧凑""节奏明快"这类词一律不许出现）。
2. 每个判断都要落到具体的句子、动作、信息点上，能指出"第几段做了什么"。
3. 手法分析要给数字或比例（如"对话占 40%，心理独白 3 处"）。
4. 最后一节必须抽象成可套用的结构公式，而不是感想。

输出结构（Markdown，二级标题分节，总字数 1000-1500 字）：

## 一、本章推进了什么
用事件链写，不写评价。3-6 个节点。

## 二、冲突结构
谁想要什么 / 谁在阻挡 / 压力如何升级 / 本章结束时张力指向哪里。

## 三、章末钩子
只分析最后 2-3 段：用了哪种手法（悬念未解、突发反转、新信息、威胁预告、关系变化），为什么读者会继续看下一章。

## 四、人物与关系
本章出场者、各自目的、关系有没有变化、有没有披露新信息。

## 五、写法特征
叙事视角、句子节奏（长短句如何交替）、对话/动作/心理/描写的占比、信息释放节奏（一次给多少、什么时候给）。

## 六、可复用结构公式
把本章骨架抽象成一句话公式 + 3-5 步分步结构，要能让别人套着写。

## 七、值得抄的一处
挑一个具体的句子或手法，说明它为什么有效，以及怎么改写到自己的书里。"""

USER_TEMPLATE = """书名：{book}
这是第 {index} 章《{title}》，正文约 {chars} 字：

---
{content}
---

按系统要求拆解这一章。"""


def load_key(provider: str) -> str:
    con = sqlite3.connect(DB)
    row = con.execute("select key from APIKey where provider=?", (provider,)).fetchone()
    con.close()
    if not row or not row[0]:
        sys.exit(f"provider {provider} 没有配置 key")
    return row[0]


def load_chapters(doc_id: str, limit: int):
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    version = con.execute(
        "select id, content from KnowledgeDocumentVersion where documentId=? order by versionNumber desc limit 1",
        (doc_id,),
    ).fetchone()
    if not version:
        sys.exit("找不到该文档的版本")
    book = con.execute("select title from KnowledgeDocument where id=?", (doc_id,)).fetchone()
    rows = con.execute(
        """select chapterIndex, title, startOffset, endOffset, charCount
           from DocumentChapter where documentVersionId=?
           order by chapterIndex limit ?""",
        (version["id"], limit),
    ).fetchall()
    con.close()
    chapters = []
    for r in rows:
        chapters.append({
            "index": r["chapterIndex"] + 1,
            "title": (r["title"] or "").strip(),
            "chars": r["charCount"],
            "content": version["content"][r["startOffset"]:r["endOffset"]],
        })
    return book["title"] if book else doc_id, chapters


def call_llm(url: str, key: str, model: str, book: str, ch: dict, retries: int = 3) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_TEMPLATE.format(
                book=book, index=ch["index"], title=ch["title"], chars=ch["chars"], content=ch["content"])},
        ],
        "max_tokens": 6000,
        "temperature": 0.4,
    }
    data = json.dumps(payload).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url.rstrip("/") + "/chat/completions",
                data=data,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
            )
            with urllib.request.urlopen(req, timeout=300) as resp:
                obj = json.loads(resp.read())
            msg = obj["choices"][0]["message"]
            content = (msg.get("content") or "").strip()
            if content:
                return content
            raise RuntimeError("空输出")
        except Exception as exc:  # noqa: BLE001
            if attempt == retries - 1:
                raise
            wait = 5 * (attempt + 1)
            print(f"    重试 {attempt + 1}/{retries}（{exc}），等待 {wait}s", flush=True)
            time.sleep(wait)
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", required=True, help="KnowledgeDocument.id")
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--provider", default="custom_genimi")
    ap.add_argument("--url", default="http://127.0.0.1:8045/v1")
    ap.add_argument("--model", default="gemini-4-hydrogen-sonar")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    book, chapters = load_chapters(args.doc, args.limit)
    out_path = args.out or os.path.join(
        os.path.dirname(__file__), "..", "..", ".book-analysis", f"{book}-前{len(chapters)}章-深度拆解.md")
    out_path = os.path.abspath(out_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    done = set()
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as f:
            for line in f:
                if line.startswith("<!-- done: "):
                    done.add(int(line.split(":")[1].split("-->")[0].strip()))

    key = load_key(args.provider)
    if not os.path.exists(out_path):
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(f"# {book} · 逐章深度拆解（第 1-{len(chapters)} 章）\n\n")

    todo = [c for c in chapters if c["index"] not in done]
    print(f"共 {len(chapters)} 章，已完成 {len(done)}，待拆 {len(todo)}", flush=True)

    for i, ch in enumerate(todo, 1):
        t0 = time.time()
        print(f"[{i}/{len(todo)}] 第 {ch['index']} 章《{ch['title']}》{ch['chars']} 字 …", end="", flush=True)
        try:
            body = call_llm(args.url, key, args.model, book, ch)
        except Exception as exc:  # noqa: BLE001
            print(f" 失败：{exc}", flush=True)
            continue
        with open(out_path, "a", encoding="utf-8") as f:
            f.write(f"\n\n---\n\n# 第 {ch['index']} 章《{ch['title']}》\n\n{body}\n\n<!-- done: {ch['index']} -->\n")
        print(f" 完成 {len(body)} 字，{time.time() - t0:.0f}s", flush=True)

    print(f"\n输出：{out_path}", flush=True)


if __name__ == "__main__":
    main()
