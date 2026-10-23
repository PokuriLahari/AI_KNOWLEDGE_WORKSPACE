import sys
from pathlib import Path
import uuid
import requests
import streamlit as st

# Ensure project root is in sys.path regardless of execution context
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from ui.background import get_floating_paths_svg
except ImportError:
    from background import get_floating_paths_svg

API_URL = "http://localhost:8000"  # FastAPI backend


def get_documents():
    try:
        resp = requests.get(f"{API_URL}/documents", timeout=5)
        if resp.status_code == 200:
            return resp.json().get("documents", [])
    except Exception:
        pass
    return []


def index_document(file):
    files = {"file": (file.name, file, file.type or "application/octet-stream")}
    resp = requests.post(f"{API_URL}/index", files=files, timeout=60)
    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text) if resp.headers.get("content-type") == "application/json" else resp.text
        raise RuntimeError(f"Indexing error ({resp.status_code}): {detail}")
    return resp.json()


def delete_document(doc_id: str):
    resp = requests.delete(f"{API_URL}/documents/{doc_id}", timeout=10)
    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text)
        raise RuntimeError(f"Delete error ({resp.status_code}): {detail}")
    return resp.json()


def ask_question(question: str, k: int = 5, session_id: str = None, document_id: str = None):
    payload = {"question": question, "k": k, "session_id": session_id, "document_id": document_id}
    resp = requests.post(f"{API_URL}/ask", json=payload, timeout=60)
    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = resp.text
        raise RuntimeError(f"Backend error ({resp.status_code}): {detail}")
    return resp.json()


def summarize_document_api(document_id: str = None, format_type: str = "standard", session_id: str = None):
    payload = {"document_id": document_id, "format": format_type, "session_id": session_id}
    resp = requests.post(f"{API_URL}/summarize", json=payload, timeout=60)
    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = resp.text
        raise RuntimeError(f"Summarization error ({resp.status_code}): {detail}")
    return resp.json()


def compare_documents_api(doc_id_a: str, doc_id_b: str, topic_query: str = None, session_id: str = None):
    payload = {
        "doc_id_a": doc_id_a,
        "doc_id_b": doc_id_b,
        "topic_query": topic_query,
        "session_id": session_id,
    }
    resp = requests.post(f"{API_URL}/compare", json=payload, timeout=90)
    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = resp.text
        raise RuntimeError(f"Comparison error ({resp.status_code}): {detail}")
    return resp.json()


def main():
    st.set_page_config(
        page_title="AI Knowledge Workspace",
        page_icon="📚",
        layout="wide",
    )

    # Ambient animated floating paths background (Dark Theme)
    if hasattr(st, "html"):
        st.html(get_floating_paths_svg(position=1))
    else:
        st.markdown(get_floating_paths_svg(position=1), unsafe_allow_html=True)


    # Initialize session state for Hindsight memory and active document tracking
    if "session_id" not in st.session_state:
        st.session_state["session_id"] = str(uuid.uuid4())
    if "messages" not in st.session_state:
        st.session_state["messages"] = []
    if "selected_doc_id" not in st.session_state:
        st.session_state["selected_doc_id"] = None

    st.title("📚 AI Knowledge Workspace")
    st.caption("Multi-Agent Document Intelligence System with Grounded Citations & Cross-Source Comparison")

    # Fetch fresh document list
    docs = get_documents()

    # --- SIDEBAR: Document Management ---
    with st.sidebar:
        st.header("📁 Knowledge Sources")
        uploaded_file = st.file_uploader(
            "Upload Document",
            type=["pdf", "docx", "pptx", "txt", "csv"],
            help="Supported formats: PDF, DOCX, PPTX, TXT, CSV (up to 25 MB)",
        )

        if uploaded_file is not None:
            if st.button("Ingest Document", use_container_width=True):
                with st.spinner("Extracting, normalizing, and embedding..."):
                    try:
                        res = index_document(uploaded_file)
                        st.session_state["selected_doc_id"] = res.get("document_id")
                        st.success(f"Indexed: {res['file']} ({res['chunks']} chunks)")
                        st.rerun()
                    except Exception as e:
                        st.error(str(e))

        st.divider()
        st.subheader("Document Library")

        if not docs:
            st.info("No documents indexed yet. Upload a document above to get started.")
        else:
            # Active Document Selection
            doc_options = {"All Workspace Documents": None}
            for d in docs:
                doc_options[d["filename"]] = d["id"]

            selected_label = st.selectbox(
                "Focus Document Scope",
                options=list(doc_options.keys()),
                index=0,
                help="Select a specific document to isolate search/summary or use all workspace documents",
            )
            st.session_state["selected_doc_id"] = doc_options[selected_label]

            # Quick action to summarize selected document
            if st.session_state["selected_doc_id"]:
                if st.button("📄 Summarize Focus Document", use_container_width=True):
                    with st.spinner("Generating document summary..."):
                        try:
                            sum_res = summarize_document_api(
                                document_id=st.session_state["selected_doc_id"],
                                session_id=st.session_state["session_id"],
                            )
                            st.session_state["messages"].append({
                                "role": "user",
                                "content": f"Please summarize {selected_label}",
                            })
                            st.session_state["messages"].append({
                                "role": "assistant",
                                "content": sum_res["summary"],
                                "contexts": sum_res.get("contexts", []),
                            })
                            st.rerun()
                        except Exception as e:
                            st.error(str(e))

            st.write("---")
            for doc in docs:
                col1, col2 = st.columns([4, 1])
                with col1:
                    is_active = (doc["id"] == st.session_state.get("selected_doc_id"))
                    prefix = "⭐ " if is_active else ""
                    st.markdown(f"**{prefix}{doc['filename']}**")
                    st.caption(f"{doc['file_type'].upper()} • {doc['chunk_count']} chunks • {doc['page_count']} pages")
                with col2:
                    if st.button("🗑️", key=f"del_{doc['id']}", help=f"Delete {doc['filename']}"):
                        try:
                            delete_document(doc["id"])
                            if st.session_state.get("selected_doc_id") == doc["id"]:
                                st.session_state["selected_doc_id"] = None
                            st.toast(f"Deleted {doc['filename']}")
                            st.rerun()
                        except Exception as e:
                            st.error(str(e))

        st.divider()
        st.subheader("Session Memory")
        st.caption(f"Session ID: `{st.session_state['session_id'][:8]}...`")
        if st.button("Clear Conversation History", use_container_width=True):
            st.session_state["session_id"] = str(uuid.uuid4())
            st.session_state["messages"] = []
            st.rerun()

    # --- MAIN PANEL: Tabs for Q&A and Document Comparison ---
    tab_chat, tab_compare = st.tabs(["💬 Conversation & Grounded Q&A", "⚖️ Document Comparison (FR-07)"])

    with tab_chat:
        # 1. Top Toolbar: Retrieval Scope Badge and Context Chunks (k) Slider
        col_scope, col_k = st.columns([5, 2])
        with col_scope:
            if st.session_state.get("selected_doc_id"):
                active_doc = next(
                    (d["filename"] for d in docs if d["id"] == st.session_state["selected_doc_id"]),
                    "Unknown",
                )
                st.info(f"🎯 Target Scope: **{active_doc}** (Isolated Retrieval)")
            else:
                st.info("🌐 Target Scope: **All Workspace Documents**")
        with col_k:
            k = st.slider(
                "Context chunks (k)",
                min_value=1,
                max_value=10,
                value=5,
                help="Number of evidence chunks retrieved for synthesis",
            )

        # 2. Scrollable conversation area (smooth independent scrolling)
        chat_container = st.container(height=520)

        with chat_container:
            if not st.session_state["messages"]:
                st.info("👋 Welcome! Ask any question, request an explanation, or summarize your documents below.")
            else:
                for msg in st.session_state["messages"]:
                    with st.chat_message(msg["role"]):
                        st.markdown(msg["content"])
                        if msg.get("contexts"):
                            num_ctx = len(msg["contexts"])
                            with st.expander(
                                f"🔍 Grounded Citations ({num_ctx} source{'s' if num_ctx > 1 else ''})",
                                expanded=False,
                            ):
                                for i, ctx in enumerate(msg["contexts"], start=1):
                                    meta = ctx.get("metadata", {})
                                    source = meta.get("source", "Unknown")
                                    page = meta.get("page", 1)
                                    st.markdown(f"**Source {i}**: `{source}` (Page/Slide {page})")
                                    st.text(ctx.get("text", ""))

        # 3. Anchored Chat Input: Positioned directly below the bounded chat container
        if question := st.chat_input("Ask a question about your knowledge workspace..."):
            st.session_state["messages"].append({"role": "user", "content": question})

            with chat_container:
                with st.chat_message("user"):
                    st.markdown(question)

                with st.chat_message("assistant"):
                    with st.spinner("Retrieving knowledge and synthesizing grounded answer..."):
                        try:
                            res = ask_question(
                                question=question,
                                k=k,
                                session_id=st.session_state["session_id"],
                                document_id=st.session_state.get("selected_doc_id"),
                            )
                            st.markdown(res["answer"])

                            if res.get("contexts"):
                                num_ctx = len(res["contexts"])
                                with st.expander(
                                    f"🔍 Grounded Citations ({num_ctx} source{'s' if num_ctx > 1 else ''})",
                                    expanded=False,
                                ):
                                    for i, ctx in enumerate(res["contexts"], start=1):
                                        meta = ctx.get("metadata", {})
                                        source = meta.get("source", "Unknown")
                                        page = meta.get("page", 1)
                                        st.markdown(f"**Source {i}**: `{source}` (Page/Slide {page})")
                                        st.text(ctx.get("text", ""))

                            st.session_state["messages"].append({
                                "role": "assistant",
                                "content": res["answer"],
                                "contexts": res.get("contexts", []),
                            })
                        except Exception as e:
                            st.error(f"Error: {e}")
            st.rerun()

    with tab_compare:
        st.subheader("⚖️ Cross-Document Comparative Analysis")
        st.write("Compare two documents to discover shared findings, methodology differences, conflicting claims, and absent topics.")

        if len(docs) < 2:
            st.warning("You need at least two documents in the Document Library to perform document comparison. Please upload another document in the sidebar.")
        else:
            col_a, col_b = st.columns(2)
            with col_a:
                doc_a_idx = 0
                doc_a_name = st.selectbox("Select Document A", options=[d["filename"] for d in docs], index=doc_a_idx)
                doc_a_id = next(d["id"] for d in docs if d["filename"] == doc_a_name)

            with col_b:
                doc_b_idx = 1 if len(docs) > 1 else 0
                doc_b_name = st.selectbox("Select Document B", options=[d["filename"] for d in docs], index=doc_b_idx)
                doc_b_id = next(d["id"] for d in docs if d["filename"] == doc_b_name)

            topic_query = st.text_input(
                "Focus Topic or Question (Optional)",
                placeholder="e.g. Revenue targets, System architecture, Risk factors (leave blank for complete comparison)",
            )

            if st.button("Run Cross-Document Comparison", type="primary", use_container_width=True):
                if doc_a_id == doc_b_id:
                    st.error("Please select two distinct documents to compare.")
                else:
                    with st.spinner(f"Analyzing and comparing '{doc_a_name}' vs '{doc_b_name}'..."):
                        try:
                            comp_res = compare_documents_api(
                                doc_id_a=doc_a_id,
                                doc_id_b=doc_b_id,
                                topic_query=topic_query if topic_query.strip() else None,
                                session_id=st.session_state["session_id"],
                            )
                            st.success("Comparison completed successfully!")

                            # Metrics row
                            m1, m2, m3, m4 = st.columns(4)
                            m1.metric("Similarities", len(comp_res.get("similarities", [])))
                            m2.metric("Differences", len(comp_res.get("differences", [])))
                            m3.metric("Conflicts Detected", len(comp_res.get("conflicts", [])))
                            m4.metric("Coverage", f"A: {comp_res.get('coverage_a')}, B: {comp_res.get('coverage_b')}")

                            st.markdown(comp_res["comparison"])

                            if comp_res.get("contexts"):
                                with st.expander("🔍 View Supporting Context Chunks & Citations"):
                                    for i, ctx in enumerate(comp_res["contexts"], start=1):
                                        meta = ctx.get("metadata", {})
                                        source = meta.get("source", "Unknown")
                                        page = meta.get("page", 1)
                                        st.markdown(f"**Chunk {i}**: `{source}` (Page {page})")
                                        st.text(ctx.get("text", ""))

                        except Exception as e:
                            st.error(f"Comparison error: {e}")


if __name__ == "__main__":
    main()