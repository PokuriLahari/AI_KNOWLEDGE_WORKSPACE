import requests
import streamlit as st

API_URL = "http://localhost:8000"  # FastAPI backend


def index_pdf(file):
    files = {"file": (file.name, file, "application/pdf")}
    resp = requests.post(f"{API_URL}/index", files=files)
    resp.raise_for_status()
    return resp.json()


def ask_question(question: str, k: int = 5):
    payload = {"question": question, "k": k}
    resp = requests.post(f"{API_URL}/ask", json=payload)
    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = resp.text
        raise RuntimeError(f"Backend error ({resp.status_code}): {detail}")
    return resp.json()


def main():
    st.set_page_config(page_title="RAG Document Q&A", layout="wide")
    st.title("📄 RAG Document Q&A (OpenAI + Chroma)")

    st.sidebar.header("Document Indexing")
    uploaded_file = st.sidebar.file_uploader("Upload a PDF", type=["pdf"])
    if uploaded_file is not None:
        if st.sidebar.button("Index PDF"):
            with st.spinner("Indexing..."):
                res = index_pdf(uploaded_file)
            st.sidebar.success(f"Indexed: {res['file']}")

    st.subheader("Ask a question about your documents")

    question = st.text_input("Question")
    k = st.slider("Number of context chunks (k)", 1, 10, 5)

    if st.button("Ask"):
        if not question.strip():
            st.warning("Please enter a question.")
        else:
            try:
                with st.spinner("Thinking..."):
                    res = ask_question(question, k=k)
            except Exception as e:
                st.error(f"Error from backend: {e}")
            else:
                st.markdown("### Answer")
                st.write(res["answer"])

                st.markdown("### Contexts used")
                for i, ctx in enumerate(res["contexts"], start=1):
                    meta = ctx["metadata"]
                    st.markdown(f"**Context {i}** — {meta.get('source')} (page {meta.get('page')})")
                    st.write(ctx["text"])
                    st.markdown("---")


if __name__ == "__main__":
    main()