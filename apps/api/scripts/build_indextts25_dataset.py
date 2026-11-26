"""
Novelova — Offline Kaggle Dataset Builder for IndexTTS 2.5 (`novelova-indextts25`).

Run this script on a Kaggle notebook (internet enabled) to assemble a self-contained,
offline-ready Kaggle dataset (~5.6 GB) containing:
  - IndexTeam/IndexTTS-2.5 checkpoints (gpt.pth, s2mel.pth, codec.pth, bpe.model, config.yaml)
  - Pre-bundled auxiliary hf_cache (w2v-bert-2.0, MaskGCT, CAMPPlus, BigVGAN)
  - Pinned Python 3.13 Linux offline wheels (transformers==4.52.1, tokenizers==0.21.0,
    accelerate==1.8.1, descript-audiotools==0.7.2, ffmpy, g2p-en, etc. — NO wetext/modelscope)
  - index-tts source tree (for zero-network sys.path import on Kaggle workers)

Output directory: /kaggle/working/novelova-indextts25
"""

import json
import os
import re
import shutil
import subprocess
import sys

OUT_DIR = os.environ.get("INDEXTTS25_OUT_DIR", "/kaggle/working/novelova-indextts25")
WHEELS_DIR = os.path.join(OUT_DIR, "wheels")
HF_CACHE_DIR = os.path.join(OUT_DIR, "hf_cache")
REPO_DIR = os.path.join(OUT_DIR, "index-tts")

os.makedirs(WHEELS_DIR, exist_ok=True)
os.makedirs(HF_CACHE_DIR, exist_ok=True)


def run(cmd: list[str]) -> None:
    print("$", " ".join(cmd))
    subprocess.run(cmd, check=True)


def main() -> None:
    # 1. Clone index-tts source tree (stripped of .git for compact dataset)
    if not os.path.isdir(REPO_DIR):
        run(["git", "clone", "--depth", "1", "https://github.com/index-tts/index-tts.git", REPO_DIR])
        git_meta = os.path.join(REPO_DIR, ".git")
        if os.path.isdir(git_meta):
            shutil.rmtree(git_meta)

    # 2. Download IndexTeam/IndexTTS-2.5 checkpoints (skipping unused QwenEmotion weights)
    from huggingface_hub import hf_hub_download, snapshot_download

    snapshot_download(
        repo_id="IndexTeam/IndexTTS-2.5",
        local_dir=OUT_DIR,
        ignore_patterns=["*.md", "*.png", "*.jpg", "qwen0.6bemo4-merge/*"],
    )

    # 3. Pre-bundle auxiliary Hugging Face backbones into hf_cache/ for HF_HUB_OFFLINE=1
    snapshot_download(
        repo_id="facebook/w2v-bert-2.0",
        local_dir=os.path.join(HF_CACHE_DIR, "w2v-bert-2.0"),
        ignore_patterns=["*.md", "*.msgpack", "*.h5"],
    )
    snapshot_download(
        repo_id="nvidia/bigvgan_v2_22khz_80band_256x",
        local_dir=os.path.join(HF_CACHE_DIR, "bigvgan"),
        ignore_patterns=["*.md"],
    )
    hf_hub_download(
        repo_id="amphion/MaskGCT",
        filename="semantic_codec/model.safetensors",
        local_dir=HF_CACHE_DIR,
    )
    hf_hub_download(
        repo_id="funasr/campplus",
        filename="campplus_cn_common.bin",
        local_dir=HF_CACHE_DIR,
    )

    # 4. Verify config.yaml uses relative checkpoint filenames
    cfg_path = os.path.join(OUT_DIR, "config.yaml")
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg_text = f.read()
    for key in ("gpt_checkpoint", "s2mel_checkpoint", "bpe_model"):
        m = re.search(rf"({key}\s*:\s*)(.+)", cfg_text)
        if m:
            val = m.group(2).strip().strip('"').strip("'")
            base = os.path.basename(val.rstrip("/"))
            if "/" in val and base and os.path.exists(os.path.join(OUT_DIR, base)):
                cfg_text = cfg_text.replace(val, base)
    with open(cfg_path, "w", encoding="utf-8") as f:
        f.write(cfg_text)

    # 5. Download pinned offline wheels (excluding wetext, WeTextProcessing, modelscope)
    pinned_wheels = [
        "transformers==4.52.1",
        "tokenizers==0.21.0",
        "accelerate==1.8.1",
        "omegaconf>=2.3.0",
        "einops>=0.8.1",
        "munch==4.0.0",
        "librosa",
        "soundfile",
        "scipy",
        "g2p-en==2.1.0",
        "inflect",
        "cn2an==0.5.22",
        "jieba==0.42.1",
        "pypinyin",
        "json5==0.10.0",
        "fugashi>=1.2.0",
        "unidic-lite>=1.0.0",
        "sentencepiece>=0.2.1",
        "tiktoken",
        "safetensors",
        "openai-whisper",
        "argbind",
        "julius",
        "flatten-dict",
        "ffmpy",
        "pyloudnorm",
        "randomname",
        "pystoi",
        "torch-stoi",
        "markdown2",
    ]
    run([sys.executable, "-m", "pip", "download", "-q", "-d", WHEELS_DIR, *pinned_wheels])
    run([sys.executable, "-m", "pip", "download", "-q", "--no-deps", "-d", WHEELS_DIR, "descript-audiotools==0.7.2"])

    # 6. Write dataset-metadata.json template
    owner = os.environ.get("KAGGLE_DATASET_NAMESPACE", "elhamullahhossaini")
    meta = {
        "title": "Novelova IndexTTS 2.5",
        "id": f"{owner}/novelova-indextts25",
        "licenses": [{"name": "other"}],
    }
    with open(os.path.join(OUT_DIR, "dataset-metadata.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"Dataset bundle ready at: {OUT_DIR}")


if __name__ == "__main__":
    main()
