from typing import Dict, List, Tuple
import time

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor


DEFAULT_CONTEXT_PROMPTS = {
    "desk_work": [
        "a person working at a desk with a laptop",
        "a person sitting at a desk using a computer",
        "an office desk workspace",
    ],
    "kitchen": [
        "a person cooking in a kitchen",
        "a kitchen counter with cooking tools",
        "someone preparing food indoors",
    ],
    "walking": [
        "a person walking indoors",
        "someone moving through a room",
        "a person standing and walking",
    ],
    "meeting": [
        "a person in a meeting room",
        "someone attending an online meeting at a desk",
        "a person talking during work",
    ],
    "resting": [
        "a person resting on a sofa",
        "someone relaxing indoors",
        "a person sitting back and resting",
    ],
}


class CLIPContextInferencer:
    def __init__(
        self,
        model_name: str = "openai/clip-vit-base-patch32",
        device: str | None = None,
        prompts: Dict[str, List[str]] | None = None,
    ):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model_name = model_name
        self.prompts = prompts or DEFAULT_CONTEXT_PROMPTS

        self.model = CLIPModel.from_pretrained(model_name).to(self.device)
        self.model.eval()
        self.processor = CLIPProcessor.from_pretrained(model_name)

        self.flat_texts: List[str] = []
        self.text_to_label: List[str] = []

        for label, prompt_list in self.prompts.items():
            for p in prompt_list:
                self.flat_texts.append(p)
                self.text_to_label.append(label)

        self.text_features = self._encode_texts(self.flat_texts)

    def _extract_tensor(self, output):
        """
        兼容不同 transformers 版本 / 不同返回类型。
        """
        if isinstance(output, torch.Tensor):
            return output

        if hasattr(output, "text_embeds") and output.text_embeds is not None:
            return output.text_embeds

        if hasattr(output, "image_embeds") and output.image_embeds is not None:
            return output.image_embeds

        if hasattr(output, "pooler_output") and output.pooler_output is not None:
            return output.pooler_output

        if hasattr(output, "last_hidden_state") and output.last_hidden_state is not None:
            # fallback: mean pooling
            return output.last_hidden_state.mean(dim=1)

        raise TypeError(f"Unsupported model output type: {type(output)}")

    def _normalize(self, x: torch.Tensor) -> torch.Tensor:
        return x / (x.norm(dim=-1, keepdim=True) + 1e-8)

    def _encode_texts(self, texts: List[str]) -> torch.Tensor:
        inputs = self.processor(
            text=texts,
            return_tensors="pt",
            padding=True,
            truncation=True,
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            # 优先尝试官方接口
            try:
                text_output = self.model.get_text_features(
                    input_ids=inputs["input_ids"],
                    attention_mask=inputs["attention_mask"],
                )
            except Exception:
                # fallback 到 forward
                text_output = self.model(
                    input_ids=inputs["input_ids"],
                    attention_mask=inputs["attention_mask"],
                )

        text_features = self._extract_tensor(text_output)
        text_features = self._normalize(text_features)
        return text_features

    def _encode_image(self, image: Image.Image) -> torch.Tensor:
        image_inputs = self.processor(images=image, return_tensors="pt")
        image_inputs = {k: v.to(self.device) for k, v in image_inputs.items()}

        with torch.no_grad():
            try:
                image_output = self.model.get_image_features(
                    pixel_values=image_inputs["pixel_values"]
                )
            except Exception:
                image_output = self.model(
                    pixel_values=image_inputs["pixel_values"]
                )

        image_features = self._extract_tensor(image_output)
        image_features = self._normalize(image_features)
        return image_features

    def infer(self, frame_bgr) -> Dict:
        if frame_bgr is None:
            return {
                "scene_label": "unknown",
                "activity_hint": "unknown",
                "confidence": 0.0,
                "motion_level": 0.0,
                "scores_by_label": {},
                "top_prompt": None,
                "model": self.model_name,
            }

        frame_rgb = frame_bgr[:, :, ::-1]
        image = Image.fromarray(frame_rgb)

        image_features = self._encode_image(image)

        sims = (image_features @ self.text_features.T).squeeze(0)
        probs = sims.softmax(dim=0)

        prompt_scores: List[Tuple[str, str, float]] = []
        for idx, score in enumerate(probs.tolist()):
            label = self.text_to_label[idx]
            prompt = self.flat_texts[idx]
            prompt_scores.append((label, prompt, score))

        label_scores: Dict[str, float] = {}
        for label, _, score in prompt_scores:
            label_scores[label] = label_scores.get(label, 0.0) + score

        best_label = max(label_scores, key=label_scores.get)
        best_score = label_scores[best_label]

        top_prompt_idx = int(torch.argmax(probs).item())
        top_prompt = self.flat_texts[top_prompt_idx]

        return {
            "scene_label": best_label,
            "activity_hint": best_label,
            "confidence": float(best_score),
            "motion_level": 0.0,
            "scores_by_label": label_scores,
            "top_prompt": top_prompt,
            "model": self.model_name,
            "ts": time.time(),
        }