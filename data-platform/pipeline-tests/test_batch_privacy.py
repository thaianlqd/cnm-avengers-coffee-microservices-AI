"""Bronze extracts only what Silver/Gold use; governed batch mode never falls back to the broad env credential."""
import re
from pathlib import Path
from unittest import TestCase

ROOT = Path(__file__).resolve().parents[1]


class BatchPrivacyTests(TestCase):
    def test_bronze_extracts_no_free_text_or_addresses(self):
        source = (ROOT / 'spark-jobs/bronze_ingestion.py').read_text()
        queries = source[source.index('QUERIES = {'):source.index('SOURCES = {')]
        for column in ('dia_chi_giao_hang', 'ghi_chu', 'delivery_address'):
            self.assertNotIn(column, queries)
        for layer in ('silver_transform.py', 'gold_aggregation.py'):
            body = (ROOT / 'spark-jobs' / layer).read_text()
            for column in ('dia_chi_giao_hang', 'ghi_chu', 'delivery_address'):
                self.assertNotIn(column, body)

    def test_governed_mode_has_no_credential_fallback(self):
        source = (ROOT / 'spark-jobs/bronze_ingestion.py').read_text()
        governed = source[source.index('def get_engine'):source.index('return sqlalchemy.create_engine')]
        self.assertIn('DATA_PLATFORM_GOVERNED_BATCH', governed)
        self.assertIn('private_database_profile()', governed)
        self.assertIsNone(re.search(r'except', governed))
