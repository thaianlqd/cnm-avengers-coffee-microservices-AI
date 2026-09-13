import streamlit as st

st.set_page_config(
    page_title="Avengers Coffee — Analytics Data Platform",
    page_icon="☕",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Redirect directly to the first page of the dashboard
st.switch_page("pages/01_Tong_Quan.py")
