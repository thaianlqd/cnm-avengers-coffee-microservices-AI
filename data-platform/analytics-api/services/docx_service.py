import io
import re
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker

from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls, qn

logger = logging.getLogger(__name__)


def _set_cell_background(cell, hex_color: str):
    tcPr = cell._tc.get_or_add_tcPr()
    for existing in tcPr.findall(qn("w:shd")):
        tcPr.remove(existing)
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tcPr.append(shd)


def _set_cell_margins(cell, top=120, bottom=120, left=140, right=140):
    tcPr = cell._tc.get_or_add_tcPr()
    for existing in tcPr.findall(qn("w:tcMar")):
        tcPr.remove(existing)
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:left w:w="{left}" w:type="dxa"/>'
        f'<w:right w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcPr.append(tcMar)


def _set_cell_border_left(cell, hex_color="047857", size="36"):
    tcPr = cell._tc.get_or_add_tcPr()
    for existing in tcPr.findall(qn("w:tcBorders")):
        tcPr.remove(existing)
    tcBorders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'<w:top w:val="none"/>'
        f'<w:left w:val="single" w:sz="{size}" w:space="0" w:color="{hex_color}"/>'
        f'<w:bottom w:val="none"/>'
        f'<w:right w:val="none"/>'
        f'</w:tcBorders>'
    )
    tcPr.append(tcBorders)


def _set_kpi_cell_borders(cell, top_color="1E3A8A", top_sz="24", border_color="E2E8F0", border_sz="4"):
    tcPr = cell._tc.get_or_add_tcPr()
    for existing in tcPr.findall(qn("w:tcBorders")):
        tcPr.remove(existing)
    tcBorders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'<w:top w:val="single" w:sz="{top_sz}" w:space="0" w:color="{top_color}"/>'
        f'<w:left w:val="single" w:sz="{border_sz}" w:space="0" w:color="{border_color}"/>'
        f'<w:bottom w:val="single" w:sz="{border_sz}" w:space="0" w:color="{border_color}"/>'
        f'<w:right w:val="single" w:sz="{border_sz}" w:space="0" w:color="{border_color}"/>'
        f'</w:tcBorders>'
    )
    tcPr.append(tcBorders)


def _set_table_borders(table, border_color="E2E8F0"):
    tblPr = table._tbl.tblPr
    for existing in tblPr.findall(qn("w:tblBorders")):
        tblPr.remove(existing)
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="single" w:sz="6" w:space="0" w:color="{border_color}"/>'
        f'<w:left w:val="none"/>'
        f'<w:bottom w:val="single" w:sz="6" w:space="0" w:color="{border_color}"/>'
        f'<w:right w:val="none"/>'
        f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>'
        f'<w:insideV w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)


def _set_table_grid(table, col_widths_dxa: List[int], total_w_dxa: int = 9360):
    """
    Ensures table has explicit fixed width and grid columns in WordprocessingML,
    preventing cell misalignment, auto-shrink, and stair-step wrapping in Microsoft Word.
    """
    tblPr = table._tbl.tblPr
    for existing in tblPr.findall(qn("w:tblW")):
        tblPr.remove(existing)
    tblPr.append(parse_xml(f'<w:tblW {nsdecls("w")} w:w="{total_w_dxa}" w:type="dxa"/>'))

    for existing in table._tbl.findall(qn("w:tblGrid")):
        table._tbl.remove(existing)

    tblGrid = parse_xml(f'<w:tblGrid {nsdecls("w")}/>')
    for w in col_widths_dxa:
        tblGrid.append(parse_xml(f'<w:gridCol {nsdecls("w")} w:w="{w}"/>'))
    table._tbl.insert(table._tbl.index(tblPr) + 1, tblGrid)


def _format_axis_value(val: float, unit: str = "") -> str:
    """Formats numeric values into executive short representation without scientific notation."""
    val_abs = abs(val)
    if val_abs >= 1_000_000_000:
        res = f"{val/1_000_000_000:.1f} tỷ" if val % 1_000_000_000 != 0 else f"{val/1_000_000_000:.0f} tỷ"
    elif val_abs >= 1_000_000:
        res = f"{val/1_000_000:.1f} tr" if val % 1_000_000 != 0 else f"{val/1_000_000:.0f} tr"
    elif val_abs >= 1_000:
        res = f"{int(val):,}"
    elif val_abs > 0:
        res = f"{val:.1f}" if isinstance(val, float) else f"{val}"
    else:
        res = "0"
    if unit:
        return f"{res} {unit}".strip()
    return res


def _clean_val(val: Any, fallback: Any = None, card: Any = None) -> str:
    if val is None:
        return "—"
    s = str(val).strip()
    # Missing values remain missing. Formatting must never manufacture a
    # plausible KPI or treat the minus sign of a genuine number as a placeholder.
    is_sql = bool(re.match(r"^\(?\s*SELECT\b", s, re.IGNORECASE)) or "FROM SILVER." in s.upper()
    missing = {"xem kết quả", "xem ket qua", "kết quả", "ket qua", "chờ kết quả",
               "cho ket qua", "đang tính", "tự động tính", "chưa có", "chua co",
               "xem chi tiết", "chờ phân tích", "placeholder", "tbd", "undefined",
               "n/a", "none", "null", "—", "-"}
    if is_sql or s.lower() in missing or s.startswith("<"):
        return _clean_val(fallback) if fallback is not None else "—"
    try:
        f = float(s.replace(",", ""))
        if f.is_integer() and abs(f) >= 100:
            return f"{int(f):,}"
    except (ValueError, TypeError):
        pass
    return s


def _add_styled_runs(
    paragraph,
    text: str,
    font_name: str = "Calibri",
    font_size: Pt = Pt(10),
    default_color: RGBColor = RGBColor(51, 65, 85),
    default_bold: bool = False,
):
    if not text:
        return
    cleaned = re.sub(r"^(#{1,6}\s+)", "", str(text).strip())
    parts = re.split(r"(\*\*.*?\*\*)", cleaned)
    for part in parts:
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) >= 4:
            bold_text = part[2:-2]
            r = paragraph.add_run(bold_text)
            r.font.name = font_name
            r.font.size = font_size
            r.font.bold = True
            r.font.color.rgb = default_color
        else:
            r = paragraph.add_run(part)
            r.font.name = font_name
            r.font.size = font_size
            r.font.bold = default_bold
            r.font.color.rgb = default_color


def _render_text_block(
    container,
    text: str,
    font_name: str = "Calibri",
    font_size: Pt = Pt(9.5),
    default_color: RGBColor = RGBColor(51, 65, 85),
    default_bold: bool = False,
    space_after: Pt = Pt(3),
):
    if not text:
        return
    if isinstance(text, (list, tuple)):
        for item in text:
            _render_text_block(container, item, font_name=font_name, font_size=font_size,
                default_color=default_color, default_bold=default_bold, space_after=space_after)
        return
    if isinstance(text, dict):
        text = next((text[k] for k in ('text', 'finding', 'statement', 'answer') if isinstance(text.get(k), str)), '')
    raw_lines = str(text).strip().split("\n")
    for raw_line in raw_lines:
        line = raw_line.strip()
        if not line:
            continue
        is_bullet = False
        if line.startswith(("- ", "* ", "• ")):
            is_bullet = True
            line = re.sub(r"^[-*•]\s+", "", line)
        line = re.sub(r"^#{1,6}\s+", "", line)

        p = container.add_paragraph(style="List Bullet" if is_bullet else "Normal")
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(2) if is_bullet else space_after
        p.paragraph_format.line_spacing = 1.2
        _add_styled_runs(
            p,
            line,
            font_name=font_name,
            font_size=font_size,
            default_color=default_color,
            default_bold=default_bold,
        )


def _generate_chart_image(chart: Dict[str, Any]) -> Optional[io.BytesIO]:
    """Render the supplied view without resampling, zero filling or tail removal.

    Dense/unsupported/invalid encodings use the explicit table fallback below.
    Missing time buckets break lines; elapsed days determine x positions.
    """
    import math
    import textwrap
    from services.forecast_service import _next
    kind = str(chart.get('chart_type') or '').lower()
    rows = chart.get('data') or []
    temporal = kind in {'line', 'area', 'multi_line', 'multiline'}
    if not rows or len(rows) > (80 if temporal else 20) or kind not in {
            'line', 'area', 'multi_line', 'multiline', 'bar', 'horizontal_bar', 'donut'}:
        return None
    if any(not isinstance(row, dict) for row in rows):
        return None
    def number(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    labels = [str(row.get('label') or row.get('name') or '') for row in rows]
    palette = ['#1E3A8A', '#2563EB', '#0284C7', '#059669', '#D97706', '#7C3AED']
    unit = str(chart.get('unit') or '')
    dates, x = [], list(range(len(rows)))
    series = []
    if temporal:
        try:
            dates = [datetime.fromisoformat(label.replace('Z', '+00:00')) for label in labels]
            x = [(dt - dates[0]).total_seconds() / 86400 for dt in dates]
            if any(right <= left for left, right in zip(x, x[1:])):
                return None
        except (ValueError, TypeError):
            return None
        keys = chart.get('series_keys') or [s['key'] for s in chart.get('series', [])]
        if kind in {'line', 'area'}:
            keys = ['value']
        if not keys or len(keys) > 8:
            return None
        names = {s['key']: s.get('label', s['key']) for s in chart.get('series', [])}
        for key in keys:
            values = [row.get(key) for row in rows]
            if any(value is not None and not number(value) for value in values):
                return None
            if not any(number(value) for value in values):
                continue
            series.append((names.get(key, key), values))
        if not series:
            return None
    else:
        values = [row.get('value') for row in rows]
        if any(not number(value) for value in values):
            return None
        if kind == 'donut' and (len(rows) > 8 or any(v < 0 for v in values) or sum(values) <= 0):
            return None
    fig = None
    try:
        fig, ax = plt.subplots(figsize=(6.5, max(2.8, len(rows) * .36) if kind == 'horizontal_bar' else 3.4), dpi=200)
        fig.patch.set_facecolor('white')
        ax.set_facecolor('white')
        if temporal:
            granularity = chart.get('granularity')
            gaps = {i for i in range(1, len(rows)) if granularity in {'day','week','month','quarter','year'}
                    and dates[i].date() != _next(dates[i-1].date(), granularity)}
            for index, (name, values) in enumerate(series):
                px, py = [], []
                for i, value in enumerate(values):
                    if i in gaps:
                        px.append(float('nan')); py.append(float('nan'))
                    px.append(x[i]); py.append(float(value) if value is not None else float('nan'))
                ax.plot(px, py, label=name, color=palette[index % len(palette)], linewidth=2,
                        marker='o', markersize=4)
                if kind == 'area':
                    ax.fill_between(px, py, color=palette[index % len(palette)], alpha=.12)
            ticks = list(range(0, len(rows), max(1, (len(rows) + 5) // 6)))
            if ticks[-1] != len(rows)-1:
                ticks.append(len(rows)-1)
            ax.set_xticks([x[i] for i in ticks])
            ax.set_xticklabels([labels[i][:10] for i in ticks], rotation=20, ha='right', fontsize=8)
            ax.margins(y=.15)
            if kind in {'multi_line', 'multiline'}:
                ax.legend(fontsize=8, loc='best')
        elif kind == 'donut':
            _, _, percentages = ax.pie(values, labels=['\n'.join(textwrap.wrap(s, 20)) for s in labels],
                   colors=[palette[i % len(palette)] for i in x], autopct='%1.1f%%',
                   startangle=90, pctdistance=.76, wedgeprops=dict(width=.45, edgecolor='white'),
                   textprops=dict(fontsize=8))
            for percentage in percentages:
                percentage.set_color('white')
                percentage.set_fontweight('bold')
        else:
            horizontal = kind == 'horizontal_bar'
            wrapped = ['\n'.join(textwrap.wrap(s, 26 if horizontal else 16)) for s in labels]
            colors = [palette[i % len(palette)] for i in x]
            if horizontal:
                ax.barh(x, values, color=colors)
                ax.set_yticks(x, wrapped, fontsize=8)
                ax.invert_yaxis()  # Preserve the supplied ranking direction/order.
                ax.margins(x=.25)
            else:
                ax.bar(x, values, color=colors)
                ax.set_xticks(x, wrapped, fontsize=8)
                ax.margins(y=.25)
            for i, value in enumerate(values):
                options = dict(fontsize=8, color='#1E293B', xytext=(3 if value >= 0 else -3, 0),
                               textcoords='offset points', va='center', ha='left' if value >= 0 else 'right') if horizontal else dict(
                                   fontsize=8, color='#1E293B', xytext=(0, 3 if value >= 0 else -3),
                                   textcoords='offset points', ha='center', va='bottom' if value >= 0 else 'top')
                ax.annotate(_format_axis_value(value, unit), (value, i) if horizontal else (i, value), **options)
        if kind != 'donut':
            if kind == 'horizontal_bar':
                ax.set_xlabel(unit, fontsize=8)
            else:
                ax.set_ylabel(unit, fontsize=8)
            ax.grid(axis='x' if kind == 'horizontal_bar' else 'y', linestyle='--', alpha=.25)
            ax.spines[['top', 'right']].set_visible(False)
            ax.tick_params(labelsize=8)
        fig.tight_layout()
        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=200, bbox_inches='tight')
        buf.seek(0)
        return buf
    except (ValueError, TypeError, KeyError) as error:
        logger.warning('Word chart uses table fallback: %s', error)
        return None
    finally:
        if fig is not None:
            plt.close(fig)


def _render_chart_table(doc, chart):
    rows = chart.get('data') or []
    doc.add_paragraph('Dùng bảng vì biểu diễn đồ thị chưa bảo toàn được các quan sát hoặc có quá nhiều nhãn. '
                      f'Hiển thị {min(15, len(rows))} trên {len(rows)} dòng của dữ liệu biểu đồ; ô thiếu là —.')
    if not rows:
        return
    series = chart.get('series_keys') or [s['key'] for s in chart.get('series', [])]
    if not series:
        series = list(dict.fromkeys(k for row in rows for k, value in row.items()
            if k not in {'label', 'name', 'color', 'entity_ref'} and not isinstance(value, (dict, list)))) or ['value']
    names = {s['key']: s.get('label', s['key']) for s in chart.get('series', [])}
    # Wide views stay readable as long-form observations, without dropping series.
    table = doc.add_table(rows=1, cols=3)
    for cell, label in zip(table.rows[0].cells, ['Nhóm / thời gian', 'Chỉ số / chuỗi', 'Giá trị']):
        cell.text = label
    for row in rows[:15]:
        for key in series:
            cells = table.add_row().cells
            cells[0].text = str(row.get('label') or row.get('name') or '')
            cells[1].text = str(names.get(key, key))
            value = row.get(key)
            cells[2].text = '—' if value is None else str(value)


def generate_report_docx(report_data: Dict[str, Any]) -> io.BytesIO:
    """
    Generates a formal, executive-grade Microsoft Word document (.docx)
    that mirrors the Web Preview modal 1:1 in structure, typography, and styling.
    """
    doc = Document()
    for name in ('Normal', 'List Bullet'):
        doc.styles[name].font.name = 'Calibri'
        doc.styles[name].font.size = Pt(10)


    # 1. Standard Corporate Page Margins (1 inch all sides)
    for section in doc.sections:
        section.top_margin = Inches(0.9)
        section.bottom_margin = Inches(0.9)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

        # Running Head: Left & Right tabs
        header = section.header
        t_head = header.add_table(rows=1, cols=2, width=Inches(6.5))
        _set_table_grid(t_head, [4680, 4680], 9360)
        c_hl = t_head.cell(0, 0)
        c_hr = t_head.cell(0, 1)
        ph_l = c_hl.paragraphs[0]
        ph_l.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r_hl = ph_l.add_run("AVENGERS COFFEE SUPPLY CHAIN & BI PLATFORM")
        r_hl.font.name = "Calibri"
        r_hl.font.size = Pt(8)
        r_hl.font.bold = True
        r_hl.font.color.rgb = RGBColor(30, 58, 138)  # #1E3A8A

        ph_r = c_hr.paragraphs[0]
        ph_r.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_hr = ph_r.add_run("DỮ LIỆU TẦNG SILVER LAKE")
        r_hr.font.name = "Calibri"
        r_hr.font.size = Pt(8)
        r_hr.font.bold = True
        r_hr.font.color.rgb = RGBColor(100, 116, 139)

        # Running Footer: Left & Right tabs
        footer = section.footer
        t_foot = footer.add_table(rows=1, cols=2, width=Inches(6.5))
        _set_table_grid(t_foot, [5200, 4160], 9360)
        c_fl = t_foot.cell(0, 0)
        c_fr = t_foot.cell(0, 1)
        pf_l = c_fl.paragraphs[0]
        pf_l.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r_fl = pf_l.add_run("Tài liệu nội bộ bảo mật • Bản quyền thuộc Avengers Coffee Data Platform")
        r_fl.font.name = "Calibri"
        r_fl.font.size = Pt(8)
        r_fl.font.italic = True
        r_fl.font.color.rgb = RGBColor(148, 163, 184)

        pf_r = c_fr.paragraphs[0]
        pf_r.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_fr = pf_r.add_run("Định dạng chuẩn Microsoft Word (.docx)")
        r_fr.font.name = "Calibri"
        r_fr.font.size = Pt(8)
        r_fr.font.italic = True
        r_fr.font.color.rgb = RGBColor(148, 163, 184)

    # 1B. Set explicit white page background in Word (prevents dark mode invert to pitch black)
    try:
        bg = parse_xml(f'<w:background {nsdecls("w")} w:color="FFFFFF"/>')
        doc._element.insert(0, bg)
        settings = doc.settings._element
        settings.append(parse_xml(f'<w:displayBackgroundShape {nsdecls("w")}/>'))
    except Exception as e:
        logger.debug("Failed to set explicit document background: %s", e)

    # 2. Document Title & Subtitle (matching web preview)
    raw_title = report_data.get("title") or "Báo Cáo Phân Tích Điều Hành Tự Động"
    current_date_str = datetime.now().strftime("%d/%m/%Y")

    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(4)
    p_title.paragraph_format.space_after = Pt(2)
    run_title = p_title.add_run(f"BÁO CÁO PHÂN TÍCH: {raw_title.upper()}")
    run_title.font.name = "Calibri"
    run_title.font.size = Pt(17)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(30, 58, 138)  # #1E3A8A

    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(10)
    run_sub = p_sub.add_run(
        "Tài liệu phân tích tự động trích xuất từ Kho dữ liệu Silver Lake • Doanh nghiệp Avengers Coffee"
    )
    run_sub.font.name = "Calibri"
    run_sub.font.size = Pt(9.5)
    run_sub.font.color.rgb = RGBColor(100, 116, 139)

    # 3. Document Metadata 4-Box Grid (matching web preview)
    t_meta = doc.add_table(rows=1, cols=4)
    t_meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    _set_table_grid(t_meta, [2340, 2340, 2340, 2340], 9360)
    _set_table_borders(t_meta, "CBD5E1")

    meta_items = [
        ("NGÀY LẬP BÁO CÁO", current_date_str, "1E293B"),
        ("NGUỒN DỮ LIỆU", "Delta Lake Silver", "047857"),
        ("ĐƠN VỊ PHỤ TRÁCH", "AI Intelligence Center", "1E293B"),
        ("TRẠNG THÁI", "Đã kiểm chứng nội bộ" if (report_data.get('quality_assessment') or {}).get('status') == 'verified'
         else "Có giới hạn cần đối chiếu", "047857"),
    ]

    for idx, (m_lbl, m_val, m_color) in enumerate(meta_items):
        c = t_meta.cell(0, idx)
        c.width = Inches(1.625)
        _set_cell_background(c, "F8FAFC")
        _set_cell_margins(c, top=80, bottom=80, left=100, right=100)

        p1 = c.paragraphs[0]
        p1.paragraph_format.space_after = Pt(1)
        r1 = p1.add_run(m_lbl)
        r1.font.name = "Calibri"
        r1.font.size = Pt(7.5)
        r1.font.bold = True
        r1.font.color.rgb = RGBColor(148, 163, 184)

        p2 = c.add_paragraph()
        p2.paragraph_format.space_after = Pt(0)
        r2 = p2.add_run(m_val)
        r2.font.name = "Calibri"
        r2.font.size = Pt(9)
        r2.font.bold = True
        r2.font.color.rgb = RGBColor(4, 120, 87) if m_color == "047857" else RGBColor(30, 41, 59)

    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # 4. Section I: TỔNG QUAN ĐIỀU HÀNH (EXECUTIVE SUMMARY)
    h_sec1 = doc.add_paragraph()
    h_sec1.paragraph_format.space_before = Pt(8)
    h_sec1.paragraph_format.space_after = Pt(4)
    r_s1 = h_sec1.add_run("I. TỔNG QUAN ĐIỀU HÀNH (EXECUTIVE SUMMARY)")
    r_s1.font.name = "Calibri"
    r_s1.font.size = Pt(11.5)
    r_s1.font.bold = True
    r_s1.font.color.rgb = RGBColor(30, 58, 138)

    exec_summary = (
        report_data.get("executive_summary")
        or "Báo cáo đã phân tích dữ liệu trên kho lưu trữ Tầng Silver Lake của Avengers Coffee."
    )

    t_summary = doc.add_table(rows=1, cols=1)
    t_summary.alignment = WD_TABLE_ALIGNMENT.CENTER
    _set_table_grid(t_summary, [9360], 9360)
    c_sum = t_summary.cell(0, 0)
    c_sum.width = Inches(6.5)
    _set_cell_background(c_sum, "F8FAFC")
    _set_cell_margins(c_sum, top=120, bottom=120, left=160, right=160)
    _set_cell_border_left(c_sum, hex_color="059669", size="36")

    p_sum_sub = c_sum.paragraphs[0]
    p_sum_sub.paragraph_format.space_after = Pt(3)
    r_sub = p_sum_sub.add_run(
        "Bản tóm tắt điều hành được tổng hợp tự động dựa trên truy vấn dữ liệu thực tế tầng Silver."
    )
    r_sub.font.name = "Calibri"
    r_sub.font.size = Pt(8.5)
    r_sub.font.italic = True
    r_sub.font.color.rgb = RGBColor(100, 116, 139)

    _render_text_block(
        c_sum,
        exec_summary,
        font_name="Calibri",
        font_size=Pt(9.5),
        default_color=RGBColor(30, 41, 59),
        space_after=Pt(3),
    )

    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # V3.2: short answer first, from verified evidence-referenced facts only.
    for line in (report_data.get("short_answer") or [])[:3]:
        doc.add_paragraph(str(line), style="List Bullet")
    quality = report_data.get("quality_assessment") or {}
    doc.add_heading("Mức độ kiểm chứng", level=2)
    verification = report_data.get("verification") or {}
    for metric in verification.get("metrics", []):
        if metric.get("total"):
            doc.add_paragraph(f"{metric['label']}: {metric['passed']}/{metric['total']}")
    if verification:
        doc.add_paragraph(f"Đối chiếu độc lập: {verification.get('independent_oracle_label', 'Chưa đo đối chiếu độc lập')}.")
    if quality.get('measurement_mode') == 'evidence_checks':
        if quality.get('score_method') and quality.get('score') is not None:
            # Internal completeness index — explicitly NOT AI accuracy (V3.2 §53).
            doc.add_paragraph(f"Mức hoàn tất kiểm chứng nội bộ: {quality['score']:g}/100 (không phải độ chính xác AI)")
            doc.add_paragraph(quality['score_method']['formula'])
        if not verification:
            doc.add_paragraph('Đối chiếu độc lập: Chưa đo. Xác suất trả lời đúng: Chưa hiệu chuẩn.')
        else:
            doc.add_paragraph('Xác suất trả lời đúng: Chưa hiệu chuẩn.')
        for check in quality.get('verification_checks', []):
            if check['total']:
                doc.add_paragraph(f"{check['label']}: {check['passed']}/{check['total']} đạt. {check['summary']}")
        doc.add_paragraph(quality.get('accuracy_assessment', {}).get('reason', 'Chưa có đáp án đối chứng độc lập.'))
    elif quality.get("score") is not None and quality.get("status") != "not_scored":
        doc.add_paragraph(f"{quality['score']}/100 · Bộ kiểm tra {quality.get('version', '2.7')}")
    else:
        doc.add_paragraph(quality.get("reason") or "Chưa đủ metadata để chấm theo V2.7.")
    doc.add_paragraph("Điểm kiểm chứng đối chiếu phạm vi, số liệu và bằng chứng; không phải xác suất AI trả lời đúng.")
    for key, label in (("completed", "Đã thực hiện"), ("missing", "Chưa thực hiện"), ("unverified", "Chưa thể xác minh"), ("limitations", "Giới hạn dữ liệu"), ("suggested_next_actions", "Bước tiếp theo")):
        values = quality.get(key, [])
        if values:
            doc.add_paragraph(label + ": " + "; ".join(v["label"] for v in values[:8]))

    # 5. Section II: CÁC CHỈ SỐ HIỆU SUẤT CỐT LÕI (KEY METRICS)
    h_sec2 = doc.add_paragraph()
    h_sec2.paragraph_format.space_before = Pt(8)
    h_sec2.paragraph_format.space_after = Pt(4)
    r_s2 = h_sec2.add_run("II. CÁC CHỈ SỐ HIỆU SUẤT CỐT LÕI (KEY METRICS)")
    r_s2.font.name = "Calibri"
    r_s2.font.size = Pt(11.5)
    r_s2.font.bold = True
    r_s2.font.color.rgb = RGBColor(30, 58, 138)

    kpi_cards = report_data.get("kpi_cards") or []
    if not kpi_cards and report_data.get("kpis"):
        kpis_raw = report_data["kpis"]
        kpi_cards = [
            {"label": "Doanh thu phân tích", "value": f"{int(kpis_raw.get('revenue') or 0):,} đ", "sub_text": "Phạm vi hợp lệ"},
            {"label": "Số lượng đơn", "value": f"{int(kpis_raw.get('orders') or 0):,} đơn", "sub_text": "Giao dịch thành công"},
            {"label": "AOV bình quân", "value": f"{int(kpis_raw.get('aov') or 0):,} đ", "sub_text": "Chi tiêu / đơn"},
            {"label": "Tỷ lệ hoàn thành", "value": f"{kpis_raw.get('completion_rate') or 0}%", "sub_text": "Đạt chuẩn vận hành"},
        ]

    if kpi_cards:
        num_cards = min(4, len(kpi_cards))
        t_kpi = doc.add_table(rows=1, cols=num_cards)
        t_kpi.alignment = WD_TABLE_ALIGNMENT.CENTER

        col_w_in = 6.5 / num_cards
        col_w_dxa = int(col_w_in * 1440)
        _set_table_grid(t_kpi, [col_w_dxa] * num_cards, 9360)

        tr = t_kpi.rows[0]
        trPr = tr._tr.get_or_add_trPr()
        trPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))
        trPr.append(parse_xml(f'<w:trHeight {nsdecls("w")} w:val="1440" w:hRule="atLeast"/>'))

        for idx in range(num_cards):
            card = kpi_cards[idx]
            c = tr.cells[idx]
            c.width = Inches(col_w_in)
            c.vertical_alignment = WD_ALIGN_VERTICAL.TOP

            tcPr = c._tc.get_or_add_tcPr()
            for el in tcPr.findall(qn("w:tcW")):
                tcPr.remove(el)
            tcPr.append(parse_xml(f'<w:tcW {nsdecls("w")} w:w="{col_w_dxa}" w:type="dxa"/>'))

            _set_cell_background(c, "F8FAFC")
            _set_cell_margins(c, top=140, bottom=140, left=120, right=120)
            _set_kpi_cell_borders(c, top_color="1E3A8A", top_sz="24", border_color="CBD5E1", border_sz="4")

            # Label
            p_lbl = c.paragraphs[0]
            p_lbl.paragraph_format.space_before = Pt(0)
            p_lbl.paragraph_format.space_after = Pt(2)
            p_lbl.paragraph_format.line_spacing = 1.0
            r_lbl = p_lbl.add_run(str(card.get("label") or "").upper()[:22])
            r_lbl.font.name = "Calibri"
            r_lbl.font.size = Pt(8)
            r_lbl.font.bold = True
            r_lbl.font.color.rgb = RGBColor(100, 116, 139)

            # Value
            p_val = c.add_paragraph()
            p_val.paragraph_format.space_before = Pt(0)
            p_val.paragraph_format.space_after = Pt(3)
            p_val.paragraph_format.line_spacing = 1.0
            val_text = _clean_val(card.get("value"), card=card)
            unit_text = str(card.get("unit") or "").strip()
            r_val = p_val.add_run(val_text)
            r_val.font.name = "Calibri"
            r_val.font.size = Pt(13)
            r_val.font.bold = True
            r_val.font.color.rgb = RGBColor(15, 23, 42)
            if unit_text:
                r_u = p_val.add_run(f" {unit_text}")
                r_u.font.name = "Calibri"
                r_u.font.size = Pt(8.5)
                r_u.font.bold = True
                r_u.font.color.rgb = RGBColor(100, 116, 139)

            # Sub-text
            p_sub = c.add_paragraph()
            p_sub.paragraph_format.space_before = Pt(0)
            p_sub.paragraph_format.space_after = Pt(0)
            p_sub.paragraph_format.line_spacing = 1.0
            sub_val = str(card.get("sub_text") or card.get("trend") or "Chỉ số Silver")[:35]
            r_sub = p_sub.add_run(sub_val)
            r_sub.font.name = "Calibri"
            r_sub.font.size = Pt(7.5)
            r_sub.font.color.rgb = RGBColor(4, 120, 87)

        doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # 6. Section III: CÁC PHÁT HIỆN TRỌNG YẾU (KEY FINDINGS)
    h_sec3 = doc.add_paragraph()
    h_sec3.paragraph_format.space_before = Pt(8)
    h_sec3.paragraph_format.space_after = Pt(4)
    r_s3 = h_sec3.add_run("III. CÁC PHÁT HIỆN TRỌNG YẾU (KEY FINDINGS)")
    r_s3.font.name = "Calibri"
    r_s3.font.size = Pt(11.5)
    r_s3.font.bold = True
    r_s3.font.color.rgb = RGBColor(30, 58, 138)

    findings_data = report_data.get("key_findings") or []
    if not findings_data:
        doc.add_paragraph("Chưa có phát hiện định lượng được kiểm chứng cho phạm vi này.")

    if findings_data:
        t_find = doc.add_table(rows=len(findings_data) + 1, cols=3)
        t_find.alignment = WD_TABLE_ALIGNMENT.CENTER
        _set_table_borders(t_find, "CBD5E1")

        # Header widths: 1.8 in, 1.4 in, 3.3 in -> total 6.5 in = 9360 dxa
        col_widths = [1.8, 1.4, 3.3]
        col_dxa = [int(w * 1440) for w in col_widths]
        _set_table_grid(t_find, col_dxa, 9360)

        headers = ["Phát hiện chính", "Giá trị định lượng", "Đánh giá & Hàm ý từ AI"]
        for c_idx, h_text in enumerate(headers):
            cell = t_find.cell(0, c_idx)
            cell.width = Inches(col_widths[c_idx])
            _set_cell_background(cell, "1E3A8A")
            _set_cell_margins(cell, top=100, bottom=100, left=120, right=120)
            p = cell.paragraphs[0]
            r = p.add_run(h_text)
            r.font.name = "Calibri"
            r.font.bold = True
            r.font.size = Pt(9.5)
            r.font.color.rgb = RGBColor(255, 255, 255)

        for r_idx, f in enumerate(findings_data, 1):
            row_cells = t_find.rows[r_idx].cells
            row_bg = "FFFFFF" if r_idx % 2 != 0 else "F8FAFC"
            for c_idx in range(3):
                row_cells[c_idx].width = Inches(col_widths[c_idx])
                _set_cell_background(row_cells[c_idx], row_bg)
                _set_cell_margins(row_cells[c_idx], top=90, bottom=90, left=120, right=120)

            # Col 1: Finding
            p1 = row_cells[0].paragraphs[0]
            _add_styled_runs(p1, str(f.get("finding") or f.get("name") or ""), font_size=Pt(9), default_color=RGBColor(30, 41, 59), default_bold=True)

            # Col 2: Value
            p2 = row_cells[1].paragraphs[0]
            r2 = p2.add_run(_clean_val(f.get("value")))
            r2.font.name = "Calibri"
            r2.font.bold = True
            r2.font.size = Pt(9)
            r2.font.color.rgb = RGBColor(4, 120, 87)

            # Col 3: Comment
            p3 = row_cells[2].paragraphs[0]
            _add_styled_runs(p3, str(f.get("comment") or f.get("note") or f.get("ai_comment") or ""), font_size=Pt(8.5), default_color=RGBColor(71, 85, 105))

    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # 7. Section IV: TRỰC QUAN HÓA & PHÂN BỔ DỮ LIỆU
    charts = report_data.get("charts") or []
    if charts:
        h_sec4 = doc.add_paragraph()
        h_sec4.paragraph_format.space_before = Pt(8)
        h_sec4.paragraph_format.space_after = Pt(2)
        r_s4 = h_sec4.add_run("IV. TRỰC QUAN HÓA & PHÂN BỔ DỮ LIỆU")
        r_s4.font.name = "Calibri"
        r_s4.font.size = Pt(11.5)
        r_s4.font.bold = True
        r_s4.font.color.rgb = RGBColor(30, 58, 138)

        p_s4_sub = doc.add_paragraph()
        p_s4_sub.paragraph_format.space_after = Pt(6)
        r_s4_sub = p_s4_sub.add_run(
            "Các góc nhìn trực quan được AI tự động tổng hợp từ dữ liệu giao dịch tầng Silver."
        )
        r_s4_sub.font.name = "Calibri"
        r_s4_sub.font.size = Pt(8.5)
        r_s4_sub.font.color.rgb = RGBColor(100, 116, 139)

        for c_idx, chart in enumerate(charts, 1):
            p_ch = doc.add_paragraph()
            p_ch.paragraph_format.space_before = Pt(8)
            p_ch.paragraph_format.space_after = Pt(3)
            p_ch.paragraph_format.keep_with_next = True

            c_type_label = {
                "horizontal_bar": "Bảng xếp hạng cột ngang",
                "donut": "Tỷ trọng cơ cấu tròn",
                "bar": "Biểu đồ cột so sánh",
                "area": "Diễn biến theo thời gian",
                "line": "Đường biến động xu hướng",
                "heatmap": "Ma trận nhiệt 2D",
                "multi_line": "Biểu đồ xu hướng đa đường",
                "multiline": "Biểu đồ xu hướng đa đường",
            }.get(chart.get("chart_type", ""), "Biểu đồ trực quan")

            r_ch_t = p_ch.add_run(f"Biểu đồ {c_idx}: {chart.get('title')} — {c_type_label}")
            r_ch_t.font.name = "Calibri"
            r_ch_t.font.bold = True
            r_ch_t.font.size = Pt(10)
            r_ch_t.font.color.rgb = RGBColor(30, 58, 138)

            chart_img_buf = _generate_chart_image(chart)
            if chart_img_buf:
                p_img = doc.add_paragraph()
                p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_img.paragraph_format.space_before = Pt(2)
                p_img.paragraph_format.space_after = Pt(4)
                p_img.add_run().add_picture(chart_img_buf, width=Inches(6.2))
            else:
                _render_chart_table(doc, chart)
            insight = chart.get("insight") or {}
            if insight:
                # V3.2 "Nhận định từ biểu đồ" (deterministic, evidence-backed).
                lines = [insight.get("why_relevant"), *(f.get("text") for f in insight.get("key_facts", [])[:3]),
                         insight.get("interpretation"), *(f"Lưu ý: {c}" for c in insight.get("caveats", [])[:2])]
                for line in [l for l in lines if l]:
                    p_insight = doc.add_paragraph(style="List Bullet")
                    p_insight.paragraph_format.space_after = Pt(1)
                    run = p_insight.add_run(str(line))
                    run.font.size = Pt(9)

        doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # 8. Section V: BẢNG TRÍCH XUẤT DỮ LIỆU TẦNG SILVER
    table_data = report_data.get("table_data", {})
    t_cols = table_data.get("columns", [])
    t_rows = table_data.get("rows", [])
    full_count = table_data.get('total_rows')
    if type(full_count) is not int or full_count < len(t_rows):
        full_count = len(t_rows)  # Legacy tables without an artifact count.
    displayed_count = min(15, len(t_rows))

    if t_cols:
        h_sec5 = doc.add_paragraph()
        h_sec5.paragraph_format.space_before = Pt(8)
        h_sec5.paragraph_format.space_after = Pt(2)
        r_s5 = h_sec5.add_run("V. BẢNG TRÍCH XUẤT DỮ LIỆU TẦNG SILVER")
        r_s5.font.name = "Calibri"
        r_s5.font.size = Pt(11.5)
        r_s5.font.bold = True
        r_s5.font.color.rgb = RGBColor(30, 58, 138)

        p_s5_sub = doc.add_paragraph()
        p_s5_sub.paragraph_format.space_after = Pt(6)
        r_s5_sub = p_s5_sub.add_run(
            f"Hiển thị {displayed_count} trên tổng số {full_count} dòng kết quả truy vấn. "
            + ("Đây là bảng trích, không phải toàn bộ kết quả." if displayed_count < full_count else "Bảng hiển thị toàn bộ kết quả.")
        )
        r_s5_sub.font.name = "Calibri"
        r_s5_sub.font.size = Pt(8.5)
        r_s5_sub.font.color.rgb = RGBColor(100, 116, 139)

        display_cols = t_cols[:6]
        display_rows = t_rows[:15] if t_rows else []

        t_detail = doc.add_table(rows=len(display_rows) + 1, cols=len(display_cols))
        t_detail.alignment = WD_TABLE_ALIGNMENT.CENTER
        _set_table_borders(t_detail, "CBD5E1")

        col_w = 6.5 / len(display_cols)
        col_w_dxa = int(col_w * 1440)
        _set_table_grid(t_detail, [col_w_dxa] * len(display_cols), 9360)

        # Header Row (matching web preview Deep Navy #1E3A8A)
        for c_idx, col_name in enumerate(display_cols):
            cell = t_detail.cell(0, c_idx)
            cell.width = Inches(col_w)
            _set_cell_background(cell, "1E3A8A")
            _set_cell_margins(cell, top=90, bottom=90, left=100, right=100)
            p = cell.paragraphs[0]
            r = p.add_run(str(col_name))
            r.font.name = "Calibri"
            r.font.bold = True
            r.font.size = Pt(8.5)
            r.font.color.rgb = RGBColor(255, 255, 255)

        # Data Rows
        for r_idx, row_data in enumerate(display_rows, 1):
            row_cells = t_detail.rows[r_idx].cells
            row_bg = "FFFFFF" if r_idx % 2 != 0 else "F8FAFC"
            for c_idx, col_name in enumerate(display_cols):
                c = row_cells[c_idx]
                c.width = Inches(col_w)
                _set_cell_background(c, row_bg)
                _set_cell_margins(c, top=80, bottom=80, left=100, right=100)

                val = (
                    row_data.get(col_name, "")
                    if isinstance(row_data, dict)
                    else (
                        row_data[c_idx]
                        if isinstance(row_data, (list, tuple)) and c_idx < len(row_data)
                        else ""
                    )
                )
                is_num = isinstance(val, (int, float))
                val_str = (
                    f"{int(val):,}"
                    if isinstance(val, (int, float)) and abs(val) > 100
                    else f"{val:.2f}" if isinstance(val, float)
                    else str(val)
                )

                p = c.paragraphs[0]
                if is_num:
                    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                r = p.add_run(val_str)
                r.font.name = "Calibri"
                r.font.size = Pt(8.5)
                r.font.color.rgb = RGBColor(15, 23, 42) if is_num else RGBColor(71, 85, 105)

        p_fn = doc.add_paragraph()
        p_fn.paragraph_format.space_before = Pt(4)
        p_fn.paragraph_format.space_after = Pt(8)
        r_fn = p_fn.add_run(
            "* Bản trích xuất hiển thị các dòng dữ liệu tiêu biểu từ kho lưu trữ Delta Lake Silver."
        )
        r_fn.font.name = "Calibri"
        r_fn.font.size = Pt(8)
        r_fn.font.italic = True
        r_fn.font.color.rgb = RGBColor(148, 163, 184)

    # 9. Section VI: NHẬN ĐỊNH CHIẾN LƯỢC & HÀM Ý KINH DOANH
    insights = report_data.get("ai_insights") or []
    if isinstance(insights, list) and insights:
        h_sec6 = doc.add_paragraph()
        h_sec6.paragraph_format.space_before = Pt(8)
        h_sec6.paragraph_format.space_after = Pt(4)
        r_s6 = h_sec6.add_run("VI. NHẬN ĐỊNH CHIẾN LƯỢC & HÀM Ý KINH DOANH")
        r_s6.font.name = "Calibri"
        r_s6.font.size = Pt(11.5)
        r_s6.font.bold = True
        r_s6.font.color.rgb = RGBColor(30, 58, 138)

        for idx, ins in enumerate(insights, 1):
            ins_text = (
                ins
                if isinstance(ins, str)
                else (ins.get("insight") or ins.get("text") or str(ins))
            )
            ins_title = f"Nhận định chiến lược {idx:02d}"
            ins_body = ins_text
            if ":" in ins_text:
                parts = ins_text.split(":", 1)
                ins_title = parts[0].strip()
                ins_body = parts[1].strip()

            t_ins = doc.add_table(rows=1, cols=2)
            t_ins.alignment = WD_TABLE_ALIGNMENT.CENTER
            _set_table_borders(t_ins, "E2E8F0")
            _set_table_grid(t_ins, [792, 8568], 9360)

            # Left badge cell
            c_badge = t_ins.cell(0, 0)
            c_badge.width = Inches(0.55)
            c_badge.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            _set_cell_background(c_badge, "1E3A8A")
            _set_cell_margins(c_badge, top=80, bottom=80, left=60, right=60)
            pb = c_badge.paragraphs[0]
            pb.alignment = WD_ALIGN_PARAGRAPH.CENTER
            rb = pb.add_run(f"{idx:02d}")
            rb.font.name = "Calibri"
            rb.font.bold = True
            rb.font.size = Pt(11)
            rb.font.color.rgb = RGBColor(255, 255, 255)

            # Right content cell
            c_body = t_ins.cell(0, 1)
            c_body.width = Inches(5.95)
            _set_cell_background(c_body, "F8FAFC")
            _set_cell_margins(c_body, top=100, bottom=100, left=140, right=140)

            p_t = c_body.paragraphs[0]
            p_t.paragraph_format.space_after = Pt(2)
            rt = p_t.add_run(ins_title)
            rt.font.name = "Calibri"
            rt.font.bold = True
            rt.font.size = Pt(9.5)
            rt.font.color.rgb = RGBColor(30, 58, 138)

            p_b = c_body.add_paragraph()
            p_b.paragraph_format.space_after = Pt(0)
            _add_styled_runs(p_b, ins_body, font_size=Pt(8.5), default_color=RGBColor(51, 65, 85))

            doc.add_paragraph().paragraph_format.space_after = Pt(4)

        doc.add_paragraph().paragraph_format.space_after = Pt(6)

    conclusion = report_data.get("conclusion") or {}
    if conclusion.get("answer"):
        doc.add_heading("KẾT LUẬN PHÂN TÍCH", level=2)
        doc.add_paragraph(str(conclusion["answer"]))
        for key, title in (("findings", "Phát hiện có bằng chứng"), ("caveats", "Lưu ý"), ("actions", "Hành động đề xuất")):
            items = conclusion.get(key) or []
            if items:
                doc.add_paragraph(title).runs[0].bold = True
                for it in items:
                    doc.add_paragraph(str(it.get("statement") if isinstance(it, dict) else it), style="List Bullet")

    # 10. Section VII: KẾT LUẬN & KHUYẾN NGHỊ HÀNH ĐỘNG (2-column side-by-side matching preview)
    h_sec7 = doc.add_paragraph()
    h_sec7.paragraph_format.space_before = Pt(8)
    h_sec7.paragraph_format.space_after = Pt(4)
    r_s7 = h_sec7.add_run("VII. KẾT LUẬN & KHUYẾN NGHỊ HÀNH ĐỘNG")
    r_s7.font.name = "Calibri"
    r_s7.font.size = Pt(11.5)
    r_s7.font.bold = True
    r_s7.font.color.rgb = RGBColor(30, 58, 138)

    conclusions = (
        report_data.get("conclusions")
        or report_data.get("executive_summary")
        or "Chưa có kết luận được kiểm chứng cho phạm vi này."
    )
    recommendations = (
        report_data.get("recommendations")
        or "Chưa có khuyến nghị có bằng chứng cho phạm vi này."
    )

    t_concl = doc.add_table(rows=1, cols=2)
    t_concl.alignment = WD_TABLE_ALIGNMENT.CENTER
    _set_table_grid(t_concl, [4680, 4680], 9360)

    # Left cell: Kết luận tự động
    c_left = t_concl.cell(0, 0)
    c_left.width = Inches(3.25)
    _set_cell_background(c_left, "F8FAFC")
    _set_cell_margins(c_left, top=120, bottom=120, left=140, right=140)
    _set_cell_border_left(c_left, hex_color="059669", size="36")
    p_cl_h = c_left.paragraphs[0]
    p_cl_h.paragraph_format.space_after = Pt(2)
    r_cl_h = p_cl_h.add_run("KẾT LUẬN TỰ ĐỘNG")
    r_cl_h.font.name = "Calibri"
    r_cl_h.font.bold = True
    r_cl_h.font.size = Pt(9.5)
    r_cl_h.font.color.rgb = RGBColor(5, 150, 105)
    _render_text_block(c_left, conclusions, font_size=Pt(8.5), default_color=RGBColor(51, 65, 85))

    # Right cell: Khuyến nghị cho Data Platform
    c_right = t_concl.cell(0, 1)
    c_right.width = Inches(3.25)
    _set_cell_background(c_right, "F8FAFC")
    _set_cell_margins(c_right, top=120, bottom=120, left=140, right=140)
    _set_cell_border_left(c_right, hex_color="0284C7", size="36")
    p_cr_h = c_right.paragraphs[0]
    p_cr_h.paragraph_format.space_after = Pt(2)
    r_cr_h = p_cr_h.add_run("KHUYẾN NGHỊ CHO DATA PLATFORM")
    r_cr_h.font.name = "Calibri"
    r_cr_h.font.bold = True
    r_cr_h.font.size = Pt(9.5)
    r_cr_h.font.color.rgb = RGBColor(2, 132, 199)
    _render_text_block(c_right, recommendations, font_size=Pt(8.5), default_color=RGBColor(51, 65, 85))

    for paragraph in doc.paragraphs:
        if re.match(r'^(?:[IVX]+\.|Biểu đồ \d)', paragraph.text):
            paragraph.paragraph_format.keep_with_next = True
    # Keep short finding/insight rows together across Word pages.
    for table in doc.tables:
        for row in table.rows:
            row._tr.get_or_add_trPr().append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))
    # Output to in-memory bytes
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf
