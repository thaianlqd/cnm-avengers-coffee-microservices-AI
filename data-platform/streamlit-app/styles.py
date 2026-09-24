import streamlit as st
import plotly.io as pio
import plotly.graph_objects as go

def inject_styles():
    st.markdown("""
<style>
  /* ─── Google Fonts ─────────────────────────────── */
  @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700;800;900&display=swap');

  /* ─── Design Tokens (Be-inspired) ─────────────── */
  :root {
    --bg-page:       #F7F8FA;
    --bg-surface:    #FFFFFF;
    --bg-elevated:   #FFFFFF;
    --bg-subtle:     #F0F2F5;
    --border:        #E4E6EB;
    --border-hover:  #C8CACD;
    --text-primary:  #0D0D0D;
    --text-secondary:#5A5E6B;
    --text-muted:    #9095A1;
    --accent:        #B91C1C;
    --accent-light:  #FEF2F2;
    --accent-hover:  #991B1B;
    --green:         #00B37D;
    --green-light:   #E6F9F4;
    --amber:         #F59E0B;
    --amber-light:   #FFFBEB;
    --blue:          #2563EB;
    --blue-light:    #EFF6FF;
    --radius-sm:     8px;
    --radius-md:     12px;
    --radius-lg:     16px;
    --shadow-sm:     0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    --shadow-md:     0 4px 16px rgba(0,0,0,0.08);
    --shadow-lg:     0 8px 32px rgba(0,0,0,0.12);
  }

  /* ─── Base Reset ───────────────────────────────── */
  html, body, [class*="css"] {
    font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    -webkit-font-smoothing: antialiased !important;
  }

  /* ─── App Background ───────────────────────────── */
  [data-testid="stAppViewContainer"] {
    background: var(--bg-page) !important;
  }
  [data-testid="stMain"] {
    background: transparent !important;
  }
  .main .block-container {
    padding-top: 1.5rem !important;
    padding-bottom: 2rem !important;
    max-width: 1200px !important;
  }

  /* ─── Sidebar ──────────────────────────────────── */
  [data-testid="stSidebar"] {
    background: var(--bg-surface) !important;
    border-right: 1px solid var(--border) !important;
    box-shadow: var(--shadow-sm) !important;
  }
  [data-testid="stSidebar"] * {
    color: var(--text-secondary) !important;
    font-family: 'Be Vietnam Pro', sans-serif !important;
  }
  [data-testid="stSidebarNav"] { display: none !important; }
  [data-testid="stSidebar"] h4 {
    color: var(--text-muted) !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    letter-spacing: 1.5px !important;
    text-transform: uppercase !important;
  }

  /* Sidebar page links */
  [data-testid="stPageLink"] {
    border-radius: var(--radius-sm) !important;
    transition: all 0.15s ease !important;
    margin-bottom: 2px !important;
  }
  [data-testid="stPageLink"]:hover {
    background: var(--bg-subtle) !important;
  }
  [data-testid="stPageLink"][aria-current="page"] {
    background: var(--accent-light) !important;
    border-left: 3px solid var(--accent) !important;
  }
  [data-testid="stPageLink"][aria-current="page"] * {
    color: var(--accent) !important;
    font-weight: 700 !important;
  }

  /* ─── Metric Cards ─────────────────────────────── */
  [data-testid="metric-container"] {
    background: var(--bg-surface) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--radius-md) !important;
    padding: 20px 22px !important;
    box-shadow: var(--shadow-sm) !important;
    transition: box-shadow 0.2s ease, transform 0.2s ease !important;
  }
  [data-testid="metric-container"]:hover {
    box-shadow: var(--shadow-md) !important;
    transform: translateY(-2px) !important;
  }
  [data-testid="metric-container"]::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent) 0%, #FF6B35 100%);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }
  [data-testid="stMetricLabel"] {
    color: var(--text-muted) !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 1px !important;
  }
  [data-testid="stMetricValue"] {
    color: var(--text-primary) !important;
    font-size: 28px !important;
    font-weight: 800 !important;
    letter-spacing: -0.5px !important;
  }
  [data-testid="stMetricDelta"] { font-size: 12px !important; font-weight: 600 !important; }

  /* ─── Tabs ──────────────────────────────────────── */
  [data-baseweb="tab-list"] {
    background: var(--bg-subtle) !important;
    border-radius: var(--radius-md) !important;
    padding: 4px !important;
    gap: 2px !important;
    border: 1px solid var(--border) !important;
  }
  [data-baseweb="tab"] {
    color: var(--text-secondary) !important;
    font-weight: 600 !important;
    font-size: 13px !important;
    border-radius: var(--radius-sm) !important;
    transition: all 0.15s ease !important;
    padding: 8px 18px !important;
    border: none !important;
    background: transparent !important;
  }
  [data-baseweb="tab"]:hover {
    background: rgba(0,0,0,0.04) !important;
    color: var(--text-primary) !important;
  }
  [aria-selected="true"] {
    background: var(--bg-surface) !important;
    color: var(--accent) !important;
    box-shadow: var(--shadow-sm) !important;
    border-radius: var(--radius-sm) !important;
  }
  [aria-selected="true"] * {
    color: var(--accent) !important;
    font-weight: 800 !important;
  }
  [data-testid="stTabContent"] {
    padding-top: 20px !important;
  }

  /* ─── Buttons ───────────────────────────────────── */
  .stButton > button {
    border-radius: var(--radius-sm) !important;
    font-weight: 600 !important;
    font-size: 13px !important;
    padding: 9px 18px !important;
    transition: all 0.15s ease !important;
    font-family: 'Be Vietnam Pro', sans-serif !important;
    border: 1px solid var(--border) !important;
    background: var(--bg-surface) !important;
    color: var(--text-primary) !important;
    box-shadow: var(--shadow-sm) !important;
  }
  .stButton > button:hover {
    border-color: var(--accent) !important;
    color: var(--accent) !important;
    box-shadow: 0 2px 8px rgba(232,0,61,0.15) !important;
    transform: translateY(-1px) !important;
  }
  .stButton > button[kind="primary"] {
    background: var(--accent) !important;
    color: #FFFFFF !important;
    border: none !important;
    box-shadow: 0 4px 14px rgba(232,0,61,0.25) !important;
  }
  .stButton > button[kind="primary"]:hover {
    background: var(--accent-hover) !important;
    box-shadow: 0 6px 20px rgba(232,0,61,0.35) !important;
    transform: translateY(-1px) !important;
  }

  /* ─── Inputs ────────────────────────────────────── */
  [data-testid="stSelectbox"] > div > div,
  [data-testid="stTextInput"] > div > div,
  [data-testid="stMultiSelect"] > div > div,
  [data-testid="stTextArea"] > div > div {
    background: var(--bg-surface) !important;
    border: 1.5px solid var(--border) !important;
    border-radius: var(--radius-sm) !important;
    color: var(--text-primary) !important;
    box-shadow: var(--shadow-sm) !important;
    transition: border-color 0.15s ease !important;
  }
  [data-testid="stSelectbox"] > div > div:focus-within,
  [data-testid="stTextInput"] > div > div:focus-within,
  [data-testid="stMultiSelect"] > div > div:focus-within,
  [data-testid="stTextArea"] > div > div:focus-within {
    border-color: var(--accent) !important;
    box-shadow: 0 0 0 3px rgba(232,0,61,0.08) !important;
  }
  .stTextInput input, .stSelectbox select, textarea {
    color: var(--text-primary) !important;
    background: var(--bg-surface) !important;
    font-family: 'Be Vietnam Pro', sans-serif !important;
  }
  label, [data-testid="stWidgetLabel"] {
    color: var(--text-secondary) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
  }

  /* ─── DataFrames ─────────────────────────────────── */
  [data-testid="stDataFrame"] {
    border-radius: var(--radius-md) !important;
    overflow: hidden !important;
    border: 1px solid var(--border) !important;
    background: var(--bg-surface) !important;
    box-shadow: var(--shadow-sm) !important;
  }

  /* ─── Expanders ──────────────────────────────────── */
  [data-testid="stExpander"] {
    background: var(--bg-surface) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--radius-md) !important;
    box-shadow: var(--shadow-sm) !important;
  }
  [data-testid="stExpander"] summary {
    color: var(--text-primary) !important;
    font-weight: 600 !important;
    font-size: 14px !important;
  }

  /* ─── Alerts ─────────────────────────────────────── */
  [data-testid="stAlert"] {
    border-radius: var(--radius-md) !important;
    border-left-width: 4px !important;
    font-size: 13px !important;
  }

  /* ─── Typography ─────────────────────────────────── */
  h1 { color: var(--text-primary) !important; font-weight: 900 !important; font-size: 30px !important; letter-spacing: -0.8px !important; }
  h2 { color: var(--text-primary) !important; font-size: 22px !important; font-weight: 800 !important; margin-bottom: 12px !important; letter-spacing: -0.3px !important; }
  h3 { color: var(--text-primary) !important; font-size: 17px !important; font-weight: 700 !important; }
  h4 { color: var(--text-secondary) !important; font-weight: 600 !important; font-size: 14px !important; }
  p, li, span { color: var(--text-secondary) !important; font-size: 14px !important; }

  /* ─── Section Divider ─────────────────────────────── */
  hr {
    border: none !important;
    border-top: 1px solid var(--border) !important;
    margin: 20px 0 !important;
  }

  /* ─── Custom Components ───────────────────────────── */

  /* Card component */
  .be-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 20px 22px;
    margin-bottom: 14px;
    box-shadow: var(--shadow-sm);
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .be-card:hover {
    box-shadow: var(--shadow-md);
    border-color: var(--border-hover);
  }
  .be-card-title {
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.4px;
    margin-bottom: 8px;
  }
  .be-metric {
    font-size: 32px;
    font-weight: 900;
    letter-spacing: -1px;
    color: var(--text-primary);
    line-height: 1;
  }
  .be-sub {
    color: var(--text-muted);
    font-size: 12px;
    margin-top: 5px;
  }

  /* Section header */
  .be-section-header {
    color: var(--text-primary);
    font-size: 17px;
    font-weight: 800;
    letter-spacing: -0.2px;
    margin-bottom: 4px;
    padding-bottom: 10px;
    border-bottom: 2px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .be-section-sub {
    color: var(--text-muted);
    font-size: 12px;
    margin-bottom: 16px;
  }

  /* Badge pills */
  .badge-red    { background: var(--accent-light); color: var(--accent); padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; border: 1px solid rgba(232,0,61,0.2); white-space: nowrap; }
  .badge-green  { background: var(--green-light);  color: var(--green);  padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; border: 1px solid rgba(0,179,125,0.2); white-space: nowrap; }
  .badge-amber  { background: var(--amber-light);  color: var(--amber);  padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; border: 1px solid rgba(245,158,11,0.2); white-space: nowrap; }
  .badge-blue   { background: var(--blue-light);   color: var(--blue);   padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; border: 1px solid rgba(37,99,235,0.2); white-space: nowrap; }

  /* Status pills */
  .status-ok   { background: var(--green-light); color: var(--green); padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(0,179,125,0.2); }
  .status-warn { background: var(--amber-light); color: var(--amber); padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(245,158,11,0.2); }
  .status-err  { background: var(--accent-light);color: var(--accent);padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(232,0,61,0.2); }

  /* Progress bars */
  .pb-wrap     { margin-bottom: 12px; }
  .pb-label    { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 13px; color: var(--text-secondary); font-weight: 600; }
  .pb-track    { background: var(--bg-subtle); border-radius: 6px; height: 7px; overflow: hidden; border: 1px solid var(--border); }
  .pb-fill     { height: 100%; border-radius: 6px; transition: width 0.4s cubic-bezier(0.4,0,0.2,1); }

  /* Alert banner */
  .alert-banner {
    background: var(--accent-light);
    border-left: 3px solid var(--accent);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    padding: 12px 16px;
    margin: 10px 0;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.6;
  }
  .alert-banner b { color: var(--accent); }

  /* Sidebar pills */
  .sidebar-status-pill {
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    margin: 8px 0;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 500;
  }
  .sidebar-status-pill.success { background: var(--green-light); border-left: 3px solid var(--green); }
  .sidebar-status-pill.info    { background: var(--blue-light);  border-left: 3px solid var(--blue);  }
  .sidebar-status-pill.warning { background: var(--amber-light); border-left: 3px solid var(--amber); }
  .sidebar-status-pill.error   { background: var(--accent-light);border-left: 3px solid var(--accent);}

  /* Section title (legacy compat) */
  .section-title {
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 800;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 20px;
    margin-bottom: 16px;
    box-shadow: var(--shadow-sm);
  }
  .dk-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px 20px; margin-bottom: 12px; transition: border-color 0.2s ease, box-shadow 0.2s ease; box-shadow: var(--shadow-sm); }
  .dk-card:hover { border-color: var(--border-hover); box-shadow: var(--shadow-md); }
  .dk-card-title { color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.4px; margin-bottom: 6px; }
  .dk-metric { font-size: 32px; font-weight: 900; letter-spacing: -1px; color: var(--text-primary); line-height: 1; }
  .dk-sub { color: var(--text-muted); font-size: 12px; margin-top: 4px; }
  .dk-section-header { color: var(--text-primary); font-size: 17px; font-weight: 800; letter-spacing: -0.3px; margin-bottom: 6px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .dk-section-sub { color: var(--text-muted); font-size: 12px; margin-bottom: 14px; }
  .neon-red    { color: var(--accent); font-weight: 700; }
  .neon-yellow { color: var(--amber); font-weight: 700; }
  .neon-green  { color: var(--green); font-weight: 700; }
  .neon-blue   { color: var(--blue); font-weight: 700; }

  /* ─── Hide Streamlit chrome ───────────────────────── */
  [data-testid="stHeader"] {
    background: transparent !important;
    border-bottom: none !important;
    display: none !important;
  }
  #MainMenu { visibility: hidden; }
  footer { visibility: hidden; }
  [data-testid="stToolbar"] { display: none; }
  [data-testid="stDecoration"] { display: none; }
</style>
""", unsafe_allow_html=True)


def init_plotly_template():
    """Plotly template: white/light matching Be-style design"""
    t = go.layout.Template()

    t.layout.paper_bgcolor = "rgba(0,0,0,0)"
    t.layout.plot_bgcolor  = "#F7F8FA"

    t.layout.font = dict(color="#5A5E6B", family="Be Vietnam Pro, Inter, sans-serif", size=12)

    axis_style = dict(
        gridcolor="#E4E6EB",
        zerolinecolor="#C8CACD",
        linecolor="#E4E6EB",
        tickfont=dict(color="#9095A1", size=11),
        showgrid=True,
    )
    t.layout.xaxis = axis_style
    t.layout.yaxis = axis_style

    t.layout.legend = dict(
        orientation="h",
        yanchor="bottom", y=1.02,
        xanchor="right", x=1,
        font=dict(color="#5A5E6B", size=11),
        bgcolor="rgba(255,255,255,0.9)",
        bordercolor="#E4E6EB",
        borderwidth=1,
    )

    # Be-inspired palette: accent red + supporting colors
    t.layout.colorway = [
        "#E8003D", "#2563EB", "#00B37D", "#F59E0B",
        "#8B5CF6", "#EC4899", "#06B6D4", "#64748B",
    ]
    t.layout.margin = dict(l=16, r=16, t=48, b=16)

    pio.templates["be_light"] = t
    pio.templates.default = "be_light"


def render_status_badge(text, status_type="info"):
    icons = {"success": "●", "info": "●", "warning": "●", "error": "●"}
    icon = icons.get(status_type, "●")
    st.markdown(f"""
    <div class="sidebar-status-pill {status_type}">
      <span style="font-size:10px;">{icon}</span>
      <div style="font-size:12px;">{text}</div>
    </div>
    """, unsafe_allow_html=True)


def apply_layout(fig, height=360, **extra):
    kw = {}
    if height:
        kw["height"] = height
    kw.update(extra)
    fig.update_layout(**kw)
    return fig


PLOTLY_LAYOUT = {}
