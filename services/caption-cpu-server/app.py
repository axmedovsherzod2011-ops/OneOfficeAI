import os
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

MODEL_ID = os.getenv("MODEL_ID", "HuggingFaceTB/SmolLM2-135M-Instruct")

app = FastAPI(title="OneOffice AI Product Caption CPU Server", version="1.0.0")

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

_generator = None


def get_generator():
    global _generator
    if _generator is None:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        model = AutoModelForCausalLM.from_pretrained(MODEL_ID)
        _generator = pipeline("text-generation", model=model, tokenizer=tokenizer, device=-1)
    return _generator


def build_prompt(request: CaptionRequest) -> str:
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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/caption", response_model=CaptionResponse)
def caption(request: CaptionRequest) -> CaptionResponse:
    try:
        generator = get_generator()
        result: list[dict[str, Any]] = generator(
            build_prompt(request),
            max_new_tokens=220,
            do_sample=True,
            temperature=0.7,
            top_p=0.9,
            return_full_text=False,
        )
        text = str(result[0].get("generated_text", "")).strip()
        if not text:
            raise RuntimeError("empty model response")
        return CaptionResponse(caption=text[:5000])
    except Exception as exc:
        raise HTTPException(status_code=503, detail="CPU caption model is temporarily unavailable") from exc
