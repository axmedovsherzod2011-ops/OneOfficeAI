import json
import os
import time
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

MODEL_ID = os.getenv("MODEL_ID", "HuggingFaceTB/SmolLM2-135M-Instruct")

app = FastAPI(title="OneOffice AI CPU Server", version="1.3.0")

class Product(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    category: str = Field(default="", max_length=200)
    price: str = Field(default="", max_length=100)
    features: list[str] = Field(default_factory=list, max_length=20)

class CaptionRequest(BaseModel):
    product: Product
    language: str = Field(default="uz", max_length=20)

class CaptionResponse(BaseModel):
    caption: str

class EnrichRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    price: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=3000)
    web_context: str = Field(default="", max_length=12000)

class EnrichResponse(BaseModel):
    enriched: dict[str, Any]

class GenerateRequest(BaseModel):
    system_prompt: str = Field(default="", max_length=12000)
    user_prompt: str = Field(min_length=1, max_length=20000)
    max_new_tokens: int = Field(default=320, ge=32, le=1024)

class GenerateResponse(BaseModel):
    text: str

_generator = None


def get_generator():
    global _generator
    if _generator is None:
        print(f"[CPU AI] MODEL_LOAD_START model={MODEL_ID}", flush=True)
        started = time.perf_counter()
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        model = AutoModelForCausalLM.from_pretrained(MODEL_ID)
        _generator = pipeline("text-generation", model=model, tokenizer=tokenizer, device=-1)
        elapsed = time.perf_counter() - started
        print(f"[CPU AI] MODEL_LOAD_FINISH model={MODEL_ID} seconds={elapsed:.2f}", flush=True)
    return _generator


def generate(prompt: str, max_new_tokens: int = 220) -> str:
    generator = get_generator()
    result: list[dict[str, Any]] = generator(
        prompt,
        max_new_tokens=max_new_tokens,
        do_sample=True,
        temperature=0.7,
        top_p=0.9,
        return_full_text=False,
    )
    text = str(result[0].get("generated_text", "")).strip()
    if not text:
        raise RuntimeError("empty model response")
    return text


def build_caption_prompt(request: CaptionRequest) -> str:
    p = request.product
    features = "\n".join(f"- {x[:300]}" for x in p.features[:20]) or "- Yo'q"
    return f"""You are Product Caption AI for OneOffice AI.
Your ONLY task is to write one professional, concise, sales-oriented product caption.
Use ONLY the supplied facts. Never invent specifications, guarantees, discounts, delivery terms, certifications, reviews, availability, or other facts.
If information is missing, omit it. Do not browse the web. Do not give marketing strategy.
Write naturally in {request.language}.

Product name: {p.name}
Category: {p.category}
Price: {p.price}
Description: {p.description}
Features:
{features}

Return ONLY the caption text, with no explanation."""


def build_enrich_prompt(request: EnrichRequest) -> str:
    web = request.web_context.strip() or "No web research context was provided."
    return f"""You are the Product Post AI for OneOffice AI.
Your ONLY task is to create structured product-post data for an e-commerce product.
Write in Uzbek.
Use the supplied product facts and research context. Do not invent precise specifications when they are not supported.
Return ONLY one valid JSON object. No markdown, no code fences, no explanation.

Product: {request.name}
Price: {request.price} UZS
Category: {request.category}
Seller notes: {request.notes or 'None'}
Research context:
{web}

JSON keys and value types:
{{
  "marketPrice": "formatted UZS string",
  "priceDiff": "short Uzbek comparison to market",
  "priceDiffPercent": 0,
  "headline": "short Uzbek headline starting with an emoji",
  "description": "2-3 sentence Uzbek product description",
  "usageGuide": "3-4 practical tips, each on a new line with an emoji",
  "dimensions": "supported dimensions or empty string",
  "weight": "supported weight or empty string",
  "extras": "2-3 supported features/specs, each on a new line with an emoji",
  "lifehacks": "2-3 useful tips, each on a new line with an emoji",
  "hashtags": "3-5 relevant hashtags separated by spaces"
}}
"""


def build_generic_prompt(request: GenerateRequest) -> str:
    if request.system_prompt:
        return f"""{request.system_prompt}

IMPORTANT: Follow the user request exactly. Return only the requested answer.

USER REQUEST:
{request.user_prompt}"""
    return request.user_prompt


def log_start(endpoint: str) -> float:
    started = time.perf_counter()
    print(f"[CPU AI] {endpoint} START model={MODEL_ID}", flush=True)
    return started


def log_finish(endpoint: str, started: float, extra: str = "") -> None:
    elapsed = time.perf_counter() - started
    suffix = f" {extra}" if extra else ""
    print(f"[CPU AI] {endpoint} FINISH seconds={elapsed:.2f}{suffix}", flush=True)


@app.get("/health")
def health() -> dict[str, str]:
    print(f"[CPU AI] /health model={MODEL_ID}", flush=True)
    return {"status": "ok", "model": MODEL_ID}


@app.post("/generate", response_model=GenerateResponse)
def generic_generate(request: GenerateRequest) -> GenerateResponse:
    started = log_start("/generate")
    try:
        text = generate(build_generic_prompt(request), request.max_new_tokens)
        response = GenerateResponse(text=text[:20000])
        log_finish("/generate", started, f"tokens={request.max_new_tokens}")
        return response
    except Exception as exc:
        print(f"[CPU AI] /generate ERROR type={type(exc).__name__} message={exc}", flush=True)
        raise HTTPException(status_code=503, detail="CPU text model is temporarily unavailable") from exc


@app.post("/caption", response_model=CaptionResponse)
def caption(request: CaptionRequest) -> CaptionResponse:
    started = log_start("/caption")
    try:
        text = generate(build_caption_prompt(request), 220)
        response = CaptionResponse(caption=text[:5000])
        log_finish("/caption", started, "tokens=220")
        return response
    except Exception as exc:
        print(f"[CPU AI] /caption ERROR type={type(exc).__name__} message={exc}", flush=True)
        raise HTTPException(status_code=503, detail="CPU caption model is temporarily unavailable") from exc


@app.post("/enrich", response_model=EnrichResponse)
def enrich(request: EnrichRequest) -> EnrichResponse:
    started = log_start("/enrich")
    try:
        raw = generate(build_enrich_prompt(request), 320)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("CPU model did not return JSON")
        parsed = json.loads(cleaned[start:end + 1])
        if not isinstance(parsed, dict):
            raise ValueError("CPU model returned non-object JSON")
        response = EnrichResponse(enriched=parsed)
        log_finish("/enrich", started, "tokens=320")
        return response
    except Exception as exc:
        print(f"[CPU AI] /enrich ERROR type={type(exc).__name__} message={exc}", flush=True)
        raise HTTPException(status_code=503, detail="CPU post generation is temporarily unavailable") from exc
