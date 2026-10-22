"""Native-Word discoveries: capture actual Matplotlib artist inputs, not PNG OCR."""
import math
import unittest
from unittest.mock import patch
from services import docx_service as d


class WordPlotTests(unittest.TestCase):
    def axes(self, chart):
        original=d.plt.subplots
        axes=[]
        def capture(*args,**kwargs):
            fig,ax=original(*args,**kwargs);axes.append(ax);return fig,ax
        with patch.object(d.plt,'subplots',side_effect=capture):
            self.assertIsNotNone(d._generate_chart_image(chart))
        return axes[0]

    def test_multiline_missing_values_are_not_zero_and_names_are_semantic(self):
        chart=dict(chart_type='multi_line',granularity='day',series_keys=['s1','s2'],
            series=[dict(key='s1',label='Cửa hàng'),dict(key='s2',label='Kiosk')],
            data=[dict(label='2026-09-01',s1=100),dict(label='2026-09-03',s2=400)])
        ax=self.axes(chart)
        self.assertFalse(any(y==0 for line in ax.lines for y in line.get_ydata()))
        self.assertEqual(set(ax.get_legend_handles_labels()[1]),{'Cửa hàng','Kiosk'})

    def test_time_distance_is_not_array_index(self):
        ax=self.axes(dict(chart_type='line',data=[dict(label='2026-09-01',value=1),
            dict(label='2026-09-02',value=2),dict(label='2026-09-11',value=3)]))
        x=ax.lines[0].get_xdata(orig=False)
        self.assertAlmostEqual((x[-1]-x[0])/(x[1]-x[0]),10)

    def test_donut_does_not_drop_tail_and_recompute_wrong_shares(self):
        ax=self.axes(dict(chart_type='donut',data=[dict(label=str(i),value=1) for i in range(8)]))
        self.assertEqual(len(ax.patches),8)

    def test_negative_bar_is_not_clipped(self):
        ax=self.axes(dict(chart_type='bar',data=[dict(label='A',value=-50),dict(label='B',value=20)]))
        self.assertLessEqual(ax.get_ylim()[0],-50)

    def test_missing_buckets_break_line_without_changing_observations(self):
        ax=self.axes(dict(chart_type='area',granularity='day',data=[dict(label='2026-09-01',value=1),
            dict(label='2026-09-02',value=2),dict(label='2026-09-11',value=3)]))
        values=list(ax.lines[0].get_ydata())
        self.assertTrue(any(math.isnan(v) for v in values))
        self.assertEqual([v for v in values if not math.isnan(v)],[1,2,3])

    def test_invalid_or_reversed_time_uses_table_and_zero_is_real(self):
        for labels in [('A','B'),('2026-09-02','2026-09-01')]:
            self.assertIsNone(d._generate_chart_image(dict(chart_type='line',
                data=[dict(label=labels[0],value=0),dict(label=labels[1],value=1)])))
        ax=self.axes(dict(chart_type='line',data=[dict(label='2026-09-01',value=0)]))
        self.assertEqual(list(ax.lines[0].get_ydata()),[0])


from tests import test_narrative_scope_20261021 as n

class WordNarrativeTests(unittest.TestCase):
    setUp=n.NarrativeScopeTests.setUp
    pipeline=n.NarrativeScopeTests.pipeline
    request=n.NarrativeScopeTests.request
    report=n.NarrativeScopeTests.report
    ranked_report=n.NarrativeScopeTests.ranked_report
    # Reuse fixture setup, not the parent test inventory.
    def test_bottom_chart_metadata_and_conclusion_are_factual(self):
        report=self.ranked_report()
        primary=next(c for c in report['charts'] if c['role']=='requested')
        self.assertEqual(primary['selection'],'Bottom N')
        statements={e['statement'] for e in report['evidence']}
        self.assertTrue(report['conclusions'])
        self.assertTrue(all(c in statements for c in report['conclusions']))
        self.assertNotIn('sản phẩm',primary['insight']['why_relevant'])

    def test_unplottable_chart_has_explicit_table_without_fabricated_zero(self):
        import zipfile
        from xml.etree import ElementTree as ET
        chart=dict(title='Chỉ số theo ngày',chart_type='line',unit='VND',
            data=[dict(label='không phải ngày',value=None),dict(label='A',value=-50)])
        with zipfile.ZipFile(d.generate_report_docx(dict(charts=[chart]))) as z:
            text=' '.join(ET.fromstring(z.read('word/document.xml')).itertext())
        self.assertIn('Dùng bảng',text)
        self.assertIn('2',text)
        self.assertIn('-50',text)
        self.assertIn('—',text)
