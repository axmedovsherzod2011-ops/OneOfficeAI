import os
import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from llama_cpp import Llama

MODEL_REPO = os.getenv("MODEL_REPO", "mradermacher/SmolLM2-135M-Instruct-GGUF")
MODEL_FILE = os.getenv("MODEL_FILE", "SmolLM2-135M-Instruct.Q2_K.gguf")
MODEL_ID = "HuggingFaceTB/SmolLM2-135M-Instruct"
app = FastAPI(title="OneOffice OneHelp AI", version="2.0.0")
_llm = None

class GenerateRequest(BaseModel):
    system_prompt: str
    user_prompt: str
    max_new_tokens: int = 384

def get_llm():
    global _llm
    if _llm is not None:
        return _llm
    started = time.perf_counter()
    print(f"[ONEHELP AI] MODEL_LOAD_START repo={MODEL_REPO} file={MODEL_FILE}", flush=True)
    _llm = Llama.from_pretrained(
        repo_id=MODEL_REPO,
        filename=MODEL_FILE,
        n_ctx=1024,
        n_threads=2,
        n_batch=64,
        verbose=False,
    )
    print(f"[ONEHELP AI] MODEL_LOAD_FINISH model={MODEL_ID} seconds={time.perf_counter()-started:.2f}", flush=True)
    return _llm

@app.get("/")
def root():
    return {"status": "ok", "service": "onehelp-cpu"}

@app.get("/health")
def health():
    print(f"[ONEHELP AI] /health model={MODEL_ID}", flush=True)
    return {"status": "ok", "model": MODEL_ID, "engine": "onehelp-cpu-gguf"}

@app.post("/generate")
def generate(req: GenerateRequest):
    started = time.perf_counter()
    print(f"[ONEHELP AI] /generate START input_chars={len(req.system_prompt)+len(req.user_prompt)}", flush=True)
    try:
        llm = get_llm()
        max_tokens = max(64, min(req.max_new_tokens, 384))
        result = llm.create_chat_completion(
            messages=[
                {"role": "system", "content": req.system_prompt},
                {"role": "user", "content": req.user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
            top_p=0.9,
        )
        text = result["choices"][0]["message"]["content"].strip()
        if not text:
            raise RuntimeError("OneHelp CPU AI returned empty text")
        print(f"[ONEHELP AI] /generate FINISH chars={len(text)} seconds={time.perf_counter()-started:.2f}", flush=True)
        return {"text": text, "model": MODEL_ID, "engine": "onehelp-cpu-gguf"}
    except Exception as exc:
        print(f"[ONEHELP AI] /generate ERROR type={type(exc).__name__} message={str(exc)[:300]}", flush=True)
        raise HTTPException(status_code=500, detail="OneHelp CPU AI generation failed")
