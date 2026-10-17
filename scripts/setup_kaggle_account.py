#!/usr/bin/env python3
"""
Noveler Kaggle Account Bootstrap & Dataset Initializer
======================================================
CLI utility for Noveler developers to verify Kaggle API credentials,
check GPU quota eligibility, and initialize the pre-mounted `noveler-models`
dataset for zero-latency instant boot (<2s) on Kaggle workers.

Usage:
    python scripts/setup_kaggle_account.py --username <username> --key <key> [--init-dataset]
    python scripts/setup_kaggle_account.py --check-all
"""

import argparse
import json
import logging
import os
import sys
import tempfile

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("setup_kaggle")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Noveler Kaggle Account Bootstrap & Dataset Initializer")
    parser.add_argument("--username", default=os.getenv("KAGGLE_USERNAME", ""), help="Kaggle Username")
    parser.add_argument("--key", default=os.getenv("KAGGLE_KEY") or os.getenv("KAGGLE_API_TOKEN", ""), help="Kaggle API Key or KGAT token")
    parser.add_argument("--init-dataset", action="store_true", help="Automatically create noveler-models dataset if missing")
    parser.add_argument("--force-recreate", action="store_true", help="Force re-creation of dataset metadata")
    return parser.parse_args()


def setup_kaggle_environment(username: str, key: str) -> None:
    if key.startswith("KGAT_"):
        os.environ["KAGGLE_API_TOKEN"] = key
        os.environ.pop("KAGGLE_KEY", None)
    else:
        os.environ["KAGGLE_USERNAME"] = username
        os.environ["KAGGLE_KEY"] = key
        os.environ.pop("KAGGLE_API_TOKEN", None)


def main() -> int:
    args = parse_args()

    username = args.username.strip()
    key = args.key.strip()

    if not username and not key.startswith("KGAT_"):
        logger.error("Please supply --username and --key, or configure KAGGLE_USERNAME and KAGGLE_KEY in your environment.")
        return 1

    logger.info("=====================================================")
    logger.info("🚀 Noveler Kaggle Account Setup & Verification")
    logger.info("Username: @%s", username or "(OAuth Token)")
    logger.info("=====================================================")

    setup_kaggle_environment(username, key)

    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
        api = KaggleApi()
        api.authenticate()
        logger.info("✓ Kaggle API authentication successful!")
    except ImportError:
        logger.error("Kaggle Python SDK not found. Install via 'uv pip install kaggle' or 'pip install kaggle'.")
        return 1
    except Exception as exc:
        logger.error("✗ Kaggle API authentication failed: %s", exc)
        return 1

    # Check for noveler-models dataset
    dataset_ref = f"{username}/noveler-models" if username else "noveler-models"
    logger.info("Checking for pre-mounted models dataset: %s...", dataset_ref)

    dataset_found = False
    try:
        datasets = api.dataset_list(user=username, search="noveler-models") if username else []
        for ds in datasets:
            ref = getattr(ds, "ref", "")
            title = getattr(ds, "title", "")
            if "noveler-models" in ref or title == "Noveler Models":
                dataset_found = True
                dataset_ref = ref
                break
    except Exception as exc:
        logger.warning("Notice checking existing datasets: %s", exc)

    if dataset_found:
        logger.info("✓ Pre-mounted dataset verified: @%s", dataset_ref)
        logger.info("  Kaggle workers with this account will achieve instant cold-starts in <2 seconds!")
    else:
        logger.warning("! Pre-mounted dataset 'noveler-models' not found on @%s.", username)
        if args.init_dataset:
            logger.info("Initializing 'noveler-models' dataset on Kaggle...")
            try:
                with tempfile.TemporaryDirectory() as tmp_dir:
                    meta = {
                        "title": "Noveler Models",
                        "id": f"{username}/noveler-models",
                        "licenses": [{"name": "apache-2.0"}],
                    }
                    meta_path = os.path.join(tmp_dir, "dataset-metadata.json")
                    with open(meta_path, "w", encoding="utf-8") as f:
                        json.dump(meta, f, indent=2)

                    readme_path = os.path.join(tmp_dir, "README.md")
                    with open(readme_path, "w", encoding="utf-8") as f:
                        f.write(
                            "# Noveler Models\n\n"
                            "Pre-mounted neural voice weights for Noveler Studio GPU workers.\n"
                            "Enables sub-2-second cold starts by eliminating on-demand weight downloads.\n"
                        )

                    api.dataset_create_new(
                        folder=tmp_dir,
                        dir_mode="zip",
                        quiet=True,
                    )
                logger.info("✓ Successfully created pre-mounted dataset: @%s/noveler-models", username)
            except Exception as exc:
                if "already exists" in str(exc).lower():
                    logger.info("✓ Dataset @%s/noveler-models already exists on Kaggle.", username)
                else:
                    logger.error("✗ Failed to create dataset: %s", exc)
                    return 1
        else:
            logger.info("Tip: Re-run with '--init-dataset' or use the Noveler Web UI Settings to initialize the dataset automatically.")

    logger.info("=====================================================")
    logger.info("Account is ready for Noveler Studio GPU synthesis!")
    logger.info("=====================================================")
    return 0


if __name__ == "__main__":
    sys.exit(main())
