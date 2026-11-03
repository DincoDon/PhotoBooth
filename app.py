from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

from config import SETTINGS

ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT / "frontend"

st.set_page_config(
    page_title=SETTINGS["page_title"],
    page_icon=SETTINGS["page_icon"],
    layout="centered",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      #MainMenu, header, footer,
      [data-testid="stToolbar"], [data-testid="stDecoration"],
      [data-testid="stStatusWidget"], [data-testid="stHeader"] { display: none !important; }

      html, body, .stApp, [data-testid="stAppViewContainer"] {
        background: #fff7f0 !important;
        overflow: hidden !important;
      }
      .block-container, [data-testid="stMainBlockContainer"] {
        padding: 0 !important; max-width: 100% !important;
      }

      iframe[src*="photobooth"], iframe[title*="photobooth"] {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        height: 100dvh !important;
        border: 0 !important;
        z-index: 999990 !important;
        background: #fff7f0;
      }
    </style>
    """,
    unsafe_allow_html=True,
)

photobooth = components.declare_component("photobooth", path=str(FRONTEND_DIR))

config = dict(SETTINGS)
recipient = st.query_params.get("to")
if recipient:
    config["to"] = str(recipient)[:40]

photobooth(config=config, key="photobooth", default=None)
