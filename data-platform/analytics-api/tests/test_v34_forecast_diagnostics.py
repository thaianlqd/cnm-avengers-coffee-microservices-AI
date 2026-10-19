"""Forecast comparison must use the same observations and disclose its sample."""
from datetime import date, timedelta
from unittest import TestCase
from unittest.mock import patch

from services import forecast_service as fs

SPEC = {'min_history': {'day': 10}, 'non_negative': True, 'missing_data_policy': 'zero_fill'}


class ForecastDiagnosticsTests(TestCase):
    def test_model_selection_compares_common_origins_instead_of_different_samples(self):
        series = [(date(2026, 7, 1) + timedelta(days=i), float(i+1)) for i in range(28)]
        methods = {'naive': lambda values: lambda h: values[-1],
                   'late_fitter': lambda values: (lambda h: values[-1]+h) if len(values) >= 24 else None}
        with patch.object(fs, 'candidate_methods', return_value=methods):
            # Enough history for the late fitter, but not for an independent
            # holdout under this fixture's declared minimum of twenty periods.
            forecast = fs.forecast(series, 'day', 2, {**SPEC, 'min_history': {'day': 20}})
        selection = forecast['diagnostics']['selection']
        self.assertEqual(forecast['method'], 'late_fitter')
        self.assertEqual(selection['common_origins'], [24, 25, 26])
        self.assertEqual({v['evaluated_points'] for v in selection['methods'].values()}, {6})
        self.assertEqual(forecast['backtest']['folds'], 3)
        self.assertEqual(forecast['backtest']['naive_baseline']['evaluated_points'], 6)

    def test_short_history_does_not_fabricate_holdout_interval_calibration(self):
        series = [(date(2026, 7, 1) + timedelta(days=i), float(i+1)) for i in range(12)]
        forecast = fs.forecast(series, 'day', 2, SPEC)
        calibration = forecast['diagnostics']['interval_calibration']
        self.assertEqual(calibration['status'], 'not_measured')
        self.assertIsNone(calibration['coverage_80_pct'])
        self.assertEqual(calibration['evaluated_points'], 0)
        self.assertIn('selection', forecast['diagnostics'])

    def test_holdout_is_not_used_to_select_the_method(self):
        series = [(date(2026, 7, 1) + timedelta(days=i), 100.0 + i % 7) for i in range(70)]
        forecast = fs.forecast(series, 'day', 3, SPEC)
        diagnostics = forecast['diagnostics']
        self.assertEqual(diagnostics['interval_calibration']['status'], 'measured')
        self.assertGreater(diagnostics['interval_calibration']['evaluated_points'], 0)
        self.assertLessEqual(max(diagnostics['selection']['common_origins']) + forecast['backtest']['test_horizon'],
                             diagnostics['interval_calibration']['holdout_start_index'])
        self.assertLessEqual(diagnostics['interval_calibration']['coverage_80_pct'], 100)
        self.assertGreaterEqual(diagnostics['interval_calibration']['coverage_80_pct'], 0)
