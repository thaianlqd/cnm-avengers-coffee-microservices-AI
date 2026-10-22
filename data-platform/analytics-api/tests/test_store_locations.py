from decimal import Decimal
from types import SimpleNamespace
from unittest import TestCase

from services.store_location_service import coordinate_projection, store_location


class StoreLocationsTests(TestCase):
    def test_recorded_decimal_coordinates_are_preserved_without_centroid_guessing(self):
        location = store_location({'latitude': Decimal('16.068520'), 'longitude': Decimal('108.224050')})
        self.assertEqual(location['latitude'], 16.06852)
        self.assertEqual(location['longitude'], 108.22405)
        self.assertEqual(location['location_status'], 'recorded')
        self.assertEqual(location['location_source'], 'identity.chi_nhanh')

    def test_missing_or_invalid_pairs_never_become_province_centroids(self):
        for latitude, longitude in [(None, 108), ('', 108), (True, 108), (91, 108), (16, 181), ('NaN', 108), (16, 'Infinity'), (0, 0), ('invalid', 108)]:
            with self.subTest(latitude=latitude, longitude=longitude):
                result = store_location({'latitude':latitude, 'longitude':longitude, 'city':'Đà Nẵng'})
                self.assertIsNone(result['latitude'])
                self.assertIsNone(result['longitude'])
                self.assertNotIn('location_source', result)

    def test_projection_requires_both_physical_columns_and_aliases_group_by(self):
        catalog = SimpleNamespace(tables={'silver.chi_nhanh':{'columns':[{'name':'vi_do'}]}})
        select, group = coordinate_projection(catalog, 'cn')
        self.assertIn('NULL::numeric', select)
        self.assertEqual(group, '')
        catalog.tables['silver.chi_nhanh']['columns'].append({'name':'kinh_do'})
        self.assertEqual(coordinate_projection(catalog, 'cn'), ('cn.vi_do AS latitude, cn.kinh_do AS longitude', ', cn.vi_do, cn.kinh_do'))
