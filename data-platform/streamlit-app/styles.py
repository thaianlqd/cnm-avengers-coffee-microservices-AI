import streamlit as st
import plotly.io as pio
import plotly.graph_objects as go

def inject_styles():
    st.markdown("""
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');

  html, body, [class*="css"] {
      font-family: 'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  }

  /* ══════════════════════════════════════════════
     DARK MODE ENTERPRISE — Toàn cục
     ══════════════════════════════════════════════ */
  [data-testid="stAppViewContainer"] {
      background: #0D0D1A !important;
  }
  [data-testid="stMain"] { background: transparent !important; }

  /* ── Sidebar ── */
  [data-testid="stSidebar"] {
      background: #10101F !important;
      border-right: 1px solid #1E1E3A !important;
  }
  [data-testid="stSidebar"] * {
      color: #C0C0D8 !important;
      font-family: 'Inter', sans-serif !important;
  }
  [data-testid="stSidebarNav"] {
      display: none !important;
  }
  [data-testid="stSidebar"] h1,
  [data-testid="stSidebar"] h2,
  [data-testid="stSidebar"] h3,
  [data-testid="stSidebar"] h4 {
      color: #FFFFFF !important;
  }

  /* ── Metric Cards ── */
  [data-testid="metric-container"] {
      background: #1A1A2E !important;
      border: 1px solid #2A2A4A !important;
      border-radius: 12px !important;
      padding: 20px 24px !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
      position: relative !important;
      overflow: hidden !important;
  }
  [data-testid="metric-container"]::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, #FF4757, #FFA502, #2ED573);
      border-radius: 12px 12px 0 0;
  }
  [data-testid="metric-container"]:hover {
      transform: translateY(-3px) !important;
      box-shadow: 0 12px 28px rgba(0,0,0,0.5) !important;
      border-color: #3A3A5A !important;
  }
  [data-testid="stMetricLabel"] {
      color: #7C7CA0 !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 1.2px !important;
  }
  [data-testid="stMetricValue"] {
      color: #FFFFFF !important;
      font-size: 28px !important;
      font-weight: 800 !important;
      letter-spacing: -0.5px !important;
  }
  [data-testid="stMetricDelta"] {
      font-size: 12px !important;
      font-weight: 700 !important;
  }

  /* ── Segmented Control / Pill Tabs ── */
  [data-baseweb="tab-list"] {
      background: #10101F !important;
      border-radius: 12px !important;
      padding: 5px !important;
      gap: 4px !important;
      border: 1px solid #1E1E3A !important;
  }
  [data-baseweb="tab"] {
      color: #7C7CA0 !important;
      font-weight: 600 !important;
      font-size: 13px !important;
      border-radius: 8px !important;
      transition: all 0.2s ease !important;
      padding: 9px 16px !important;
      border: 1px solid transparent !important;
  }
  [data-baseweb="tab"]:hover {
      color: #C0C0D8 !important;
      background: #1A1A2E !important;
  }
  [aria-selected="true"] {
      background: linear-gradient(135deg, #FF4757 0%, #C0392B 100%) !important;
      color: #FFFFFF !important;
      border-radius: 8px !important;
      box-shadow: 0 4px 14px rgba(255,71,87,0.35) !important;
      border: 1px solid rgba(255,71,87,0.5) !important;
  }
  [aria-selected="true"] * {
      color: #FFFFFF !important;
      font-weight: 800 !important;
  }

  /* ── Action Buttons ── */
  .stButton > button {
      border-radius: 10px !important;
      font-weight: 700 !important;
      font-size: 13px !important;
      padding: 9px 20px !important;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
      font-family: 'Inter', sans-serif !important;
      border: 1px solid #2A2A4A !important;
      background: #1A1A2E !important;
      color: #C0C0D8 !important;
  }
  .stButton > button:hover {
      border-color: #FF4757 !important;
      color: #FFFFFF !important;
      transform: translateY(-1px) !important;
  }
  .stButton > button[kind="primary"] {
      background: linear-gradient(135deg, #FF4757 0%, #C0392B 100%) !important;
      color: #FFFFFF !important;
      border: none !important;
      box-shadow: 0 4px 14px rgba(255,71,87,0.3) !important;
  }
  .stButton > button[kind="primary"]:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 6px 20px rgba(255,71,87,0.45) !important;
  }

  /* ── Typography & Headings ── */
  h1 { color: #FFFFFF !important; font-weight: 800 !important; font-size: 30px !important; letter-spacing: -0.5px; }
  h2 { color: #E0E0F0 !important; font-size: 22px !important; font-weight: 800 !important; margin-bottom: 16px !important; }
  h3 { color: #C0C0D8 !important; font-size: 18px !important; font-weight: 700 !important; }
  h4 { color: #A0A0C0 !important; font-weight: 600 !important; }
  p, li, span { color: #A0A0C0; font-size: 15px; }

  /* ── Status Pills & Badges ── */
  .status-ok   { background: rgba(46,213,115,0.15); color:#2ED573; padding:5px 12px; border-radius:20px; font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:6px; border:1px solid rgba(46,213,115,0.35); }
  .status-warn { background: rgba(255,165,2,0.15); color:#FFA502; padding:5px 12px; border-radius:20px; font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:6px; border:1px solid rgba(255,165,2,0.35); }
  .status-err  { background: rgba(255,71,87,0.15); color:#FF4757; padding:5px 12px; border-radius:20px; font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:6px; border:1px solid rgba(255,71,87,0.35); }

  /* ── DataFrames ── */
  [data-testid="stDataFrame"] {
      border-radius: 12px !important;
      overflow: hidden !important;
      border: 1px solid #2A2A4A !important;
      background: #1A1A2E !important;
  }

  /* ── Expanders & Cards ── */
  [data-testid="stExpander"] {
      background: #1A1A2E;
      border: 1px solid #2A2A4A;
      border-radius: 12px;
  }

  /* ── Inputs & Selects ── */
  [data-testid="stSelectbox"] > div > div,
  [data-testid="stTextInput"] > div > div,
  [data-testid="stMultiSelect"] > div > div {
      background: #1A1A2E !important;
      border: 1px solid #2A2A4A !important;
      border-radius: 10px !important;
      color: #C0C0D8 !important;
  }
  .stTextInput input, .stSelectbox select {
      color: #C0C0D8 !important;
      background: #1A1A2E !important;
  }

  /* ── Section Cards (Legacy) ── */
  .section-card {
      background: #1A1A2E;
      border: 1px solid #2A2A4A;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
  }
  .section-title {
      color: #1E293B;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
  }

  #MainMenu { visibility: hidden; }
  footer { visibility: hidden; }
  [data-testid="stToolbar"] { display: none; }

  /* ══════════════════════════════════════════════
     DARK MODE — Enterprise Tab Components
     dk-card, dk-section-header, pb-*, badge-*, neon-*, alert-banner
     ══════════════════════════════════════════════ */

  /* ── Dark Cards ── */
  .dk-card {
      background: #1A1A2E;
      border: 1px solid #2A2A4A;
      border-radius: 14px;
      padding: 18px 20px;
      margin-bottom: 12px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .dk-card:hover {
      border-color: #3A3A5A;
      box-shadow: 0 6px 24px rgba(0,0,0,0.35);
  }
  .dk-card-title {
      color: #7C7CA0;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.4px;
      margin-bottom: 6px;
  }
  .dk-metric {
      font-size: 36px;
      font-weight: 900;
      letter-spacing: -1px;
      line-height: 1;
  }
  .dk-sub {
      color: #7C7CA0;
      font-size: 12px;
      margin-top: 4px;
  }

  /* ── Section Headers ── */
  .dk-section-header {
      color: #E0E0F0;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.3px;
      margin-bottom: 6px;
      padding-bottom: 8px;
      border-bottom: 1px solid #1E1E3A;
  }
  .dk-section-sub {
      color: #7C7CA0;
      font-size: 12px;
      margin-bottom: 14px;
  }

  /* ── Progress Bars (pb-*) ── */
  .pb-wrap {
      margin-bottom: 14px;
  }
  .pb-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 5px;
      font-size: 13px;
      color: #C0C0D8;
      font-weight: 600;
  }
  .pb-track {
      background: #12122A;
      border-radius: 6px;
      height: 8px;
      overflow: hidden;
      border: 1px solid #1E1E3A;
  }
  .pb-fill {
      height: 100%;
      border-radius: 6px;
      transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* ── Badges ── */
  .badge-red {
      background: rgba(255,71,87,0.15);
      color: #FF4757;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid rgba(255,71,87,0.35);
      white-space: nowrap;
  }
  .badge-yellow {
      background: rgba(255,165,2,0.15);
      color: #FFA502;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid rgba(255,165,2,0.35);
      white-space: nowrap;
  }
  .badge-green {
      background: rgba(46,213,115,0.15);
      color: #2ED573;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid rgba(46,213,115,0.35);
      white-space: nowrap;
  }

  /* ── Neon Text Helpers ── */
  .neon-red    { color: #FF4757; font-weight: 700; }
  .neon-yellow { color: #FFA502; font-weight: 700; }
  .neon-green  { color: #2ED573; font-weight: 700; }
  .neon-blue   { color: #1E90FF; font-weight: 700; }

  /* ── Alert Banner ── */
  .alert-banner {
      background: rgba(255,71,87,0.08);
      border-left: 3px solid #FF4757;
      border-radius: 0 10px 10px 0;
      padding: 12px 16px;
      margin: 10px 0;
      font-size: 13px;
      color: #C0C0D8;
      line-height: 1.6;
  }
  .alert-banner b { color: #FF4757; }
  .alert-banner code {
      background: rgba(255,255,255,0.08);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 12px;
      color: #E0E0F0;
  }

  /* Custom Sidebar Status Pills */
  .sidebar-status-pill {
      border-radius: 10px;
      padding: 12px 16px;
      margin: 10px 0;
      font-size: 13px;
      color: #C0C0D8;
      line-height: 1.5;
      font-family: 'Inter', sans-serif;
      display: flex;
      align-items: center;
      gap: 10px;
  }
  .sidebar-status-pill.success {
      background: rgba(46,213,115,0.08);
      border-left: 3px solid #2ED573;
  }
  .sidebar-status-pill.info {
      background: rgba(30,144,255,0.08);
      border-left: 3px solid #1E90FF;
  }
  .sidebar-status-pill.warning {
      background: rgba(255,165,2,0.08);
      border-left: 3px solid #FFA502;
  }
  .sidebar-status-pill.error {
      background: rgba(255,71,87,0.08);
      border-left: 3px solid #FF4757;
  }
</style>
""", unsafe_allow_html=True)


def init_plotly_template():
    """Tạo Plotly template 'avengers_dark' và set làm mặc định"""
    dark_template = go.layout.Template()
    
    # Nền trong suốt
    dark_template.layout.paper_bgcolor = "rgba(0,0,0,0)"
    dark_template.layout.plot_bgcolor = "rgba(0,0,0,0)"
    
    # Font chữ
    dark_template.layout.font.color = "#C0C0D8"
    dark_template.layout.font.family = "Inter, sans-serif"
    
    # Lưới và trục
    axis_style = dict(
        gridcolor="#2A2A3E",
        zerolinecolor="#3A3A5A",
        linecolor="#2A2A3E",
        tickfont=dict(color="#7C7CA0", size=11)
    )
    dark_template.layout.xaxis = axis_style
    dark_template.layout.yaxis = axis_style
    
    # Legend
    dark_template.layout.legend = dict(
        title=dict(text=""),
        orientation="h",
        yanchor="bottom",
        y=1.02,
        xanchor="right",
        x=1,
        font=dict(color="#C0C0D8", size=12),
        bgcolor="rgba(26,26,46,0.9)",
        bordercolor="#2A2A4A",
        borderwidth=1
    )
    
    # Colorway mặc định (cho các biểu đồ)
    dark_template.layout.colorway = ["#FF4757", "#2ED573", "#1E90FF", "#FFA502", "#8B5CF6", "#EC4899"]
    
    # Set default
    pio.templates["avengers_dark"] = dark_template
    pio.templates.default = "avengers_dark"


def render_status_badge(text, status_type="info"):
    """
    Render custom HTML badge thay thế cho st.info / st.success.
    status_type: 'success', 'info', 'warning', 'error'
    """
    icons = {
        "success": "✅",
        "info": "ℹ️",
        "warning": "⚠️",
        "error": "❌"
    }
    icon = icons.get(status_type, "ℹ️")
    st.markdown(f"""
    <div class="sidebar-status-pill {status_type}">
      <span style="font-size:16px;">{icon}</span>
      <div>{text}</div>
    </div>
    """, unsafe_allow_html=True)

def apply_layout(fig, height=360, **extra):
    """Wrapper function to replace old apply_layout. Uses global template."""
    kw = {}
    if height:
        kw["height"] = height
    kw.update(extra)
    fig.update_layout(**kw)
    return fig

PLOTLY_LAYOUT = {}
