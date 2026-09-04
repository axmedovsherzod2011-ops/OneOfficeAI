import os
import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

MODEL_ID = os.getenv("MODEL_ID", "HuggingFaceTB/SmolLM2-135M-Instruct")
app = FastAPI(title="OneOffice OneHelp AI", version="1.0.0")
_generator = None

class GenerateRequest(BaseModel):
    system_prompt: str
    user_prompt: str
    max_new_tokens: int = 768

def get_generator():
    global _generator
    if _generator is not None:
        return _generator
    started = time.perf_counter()
    print(f"[ONEHELP AI] MODEL_LOAD_START model={MODEL_ID}", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(MODEL_ID)
    _generator = pipeline("text-generation", model=model, tokenizer=tokenizer, device=-1)
    print(f"[ONEHELP AI] MODEL_LOAD_FINISH model={MODEL_ID} seconds={time.perf_counter()-started:.2f}", flush=True)
    return _generator

@app.get("/health")
def health():
    print(f"[ONEHELP AI] /health model={MODEL_ID}", flush=True)
    return {"status": "ok", "model": MODEL_ID, "engine": "onehelp-cpu"}

@app.post("/generate")
def generate(req: GenerateRequest):
    started = time.perf_counter()
    print(f"[ONEHELP AI] /generate START input_chars={len(req.system_prompt)+len(req.user_prompt)}", flush=True)
    try:
        generator = get_generator()
        prompt = f"<|system|>\n{req.system_prompt}\n<|end|>\n<|user|>\n{req.user_prompt}\n<|end|>\n<|assistant|>\n"
        max_new_tokens = max(64, min(req.max_new_tokens, 1024))
        result = generator(prompt, max_new_tokens=max_new_tokens, do_sample=False, return_full_text=False, pad_token_id=generator.tokenizer.eos_token_id)
        text = result[0]["generated_text"].strip()
        if not text:
            raise RuntimeError("OneHelp CPU AI returned empty text")
        print(f"[ONEHELP AI] /generate FINISH chars={len(text)} seconds={time.perf_counter()-started:.2f}", flush=True)
        return {"text": text, "model": MODEL_ID, "engine": "onehelp-cpu"}
    except Exception as exc:
        print(f"[ONEHELP AI] /generate ERROR type={type(exc).__name__} message={str(exc)[:300]}", flush=True)
        raise HTTPException(status_code=500, detail="OneHelp CPU AI generation failed")
