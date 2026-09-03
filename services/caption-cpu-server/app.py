import json
import os
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

MODEL_ID = os.getenv("MODEL_ID", "HuggingFaceTB/SmolLM2-135M-Instruct")

app = FastAPI(title="OneOffice AI CPU Server", version="1.1.0")

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

_generator = None


def get_generator():
    global _generator
    if _generator is None:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        model = AutoModelForCausalLM.from_pretrained(MODEL_ID)
        _generator = pipeline("text-generation", model=model, tokenizer=tokenizer, device=-1)
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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_ID}


@app.post("/caption", response_model=CaptionResponse)
def caption(request: CaptionRequest) -> CaptionResponse:
    try:
        text = generate(build_caption_prompt(request), 220)
        return CaptionResponse(caption=text[:5000])
    except Exception as exc:
        raise HTTPException(status_code=503, detail="CPU caption model is temporarily unavailable") from exc


@app.post("/enrich", response_model=EnrichResponse)
def enrich(request: EnrichRequest) -> EnrichResponse:
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
        return EnrichResponse(enriched=parsed)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="CPU post generation is temporarily unavailable") from exc
