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


if __name__=='__main__':unittest.main()
