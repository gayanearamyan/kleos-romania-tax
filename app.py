"""
Kleos — Romania contractor taxation page · Streamlit test harness.

Two views, switchable from the sidebar:

1. "Full landing page" — renders index.html, the complete Kleos-branded
   standalone page (hero, calculator, classification test, cases, FAQ,
   EN/RO toggle). This is the design master.

2. "Webflow engine preview" — runs kleos-tax-engine.js against a country
   config JSON exactly the way the future Webflow embed will: config in a
   <script type="application/json"> tag, engine mounted on #kleos-calc and
   #kleos-classify. The config is shown in an editable box, so you can
   tweak rates/thresholds (or paste a whole new country) and re-render
   live — this is how you'll test country #2 before it ever touches
   Webflow.

Run:
    pip install streamlit
    streamlit run app.py
"""

import json
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

HERE = Path(__file__).parent

st.set_page_config(
    page_title="Kleos — Romania contractor taxes",
    page_icon="🟠",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
      #MainMenu, header, footer {visibility: hidden;}
      .block-container {padding: 0.5rem 1rem !important; max-width: 100% !important;}
      iframe {border: none; border-radius: 12px;}
    </style>
    """,
    unsafe_allow_html=True,
)

view = st.sidebar.radio(
    "View",
    ["Full landing page", "Webflow engine preview"],
    help="The landing page is the design master. The engine preview runs "
         "the config-driven calculator exactly as the Webflow embed will.",
)

if view == "Full landing page":
    html = (HERE / "index.html").read_text(encoding="utf-8")
    components.html(html, height=6600, scrolling=True)

else:
    default_cfg = (HERE / "countries" / "ro.config.json").read_text(encoding="utf-8")
    engine = (HERE / "kleos-tax-engine.js").read_text(encoding="utf-8")

    st.sidebar.markdown("**Country config (editable)**")
    cfg_text = st.sidebar.text_area(
        "Paste any country's config JSON here",
        value=default_cfg,
        height=420,
        label_visibility="collapsed",
    )

    try:
        json.loads(cfg_text)  # validate before rendering
        cfg_ok = True
    except json.JSONDecodeError as e:
        cfg_ok = False
        st.error(f"Config JSON is invalid — fix it in the sidebar. ({e})")

    if cfg_ok:
        # Assemble the page the same way the Webflow embed will,
        # but with the engine inlined so no CDN is needed while testing.
        page = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  body {{ font-family:'Archivo',sans-serif; color:#141414; margin:0;
         background:#024616; padding:32px 20px; }}
  .card {{ background:#fff; border-radius:24px; padding:30px;
           max-width:1100px; margin:0 auto 26px;
           box-shadow:0 24px 60px rgba(0,0,0,.28); }}
  .card h2 {{ margin:0 0 18px; font-weight:800; letter-spacing:-.02em; }}
  .langs {{ max-width:1100px; margin:0 auto 16px; display:flex; gap:8px; }}
  .langs button {{ font:inherit; font-weight:700; border:0; cursor:pointer;
           border-radius:9px; padding:8px 16px; background:rgba(255,255,255,.15);
           color:#fff; }}
  .langs button:hover {{ background:rgba(255,255,255,.3); }}
</style></head>
<body>
  <div class="langs">
    <button data-kleos-lang="en">EN</button>
    <button data-kleos-lang="ro">RO</button>
  </div>
  <div class="card"><h2>Calculator</h2><div id="kleos-calc"></div></div>
  <div class="card"><h2>Classification test</h2><div id="kleos-classify"></div></div>
  <script type="application/json" id="kleos-config">{cfg_text}</script>
  <script>{engine}</script>
</body></html>"""
        components.html(page, height=1700, scrolling=True)
        st.sidebar.success("Engine running. Edit the JSON to re-render.")
