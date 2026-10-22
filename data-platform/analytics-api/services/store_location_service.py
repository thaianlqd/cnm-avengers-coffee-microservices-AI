"""Public business locations from the governed store projection; never geocode or infer GPS."""
import math


def coordinate_projection(catalog=None, alias=None):
    if catalog is None:
        from services.metadata_service import get_local_metadata
        table=get_local_metadata().get('table_map',{}).get('silver.chi_nhanh',{})
    else:
        table=catalog.tables.get('silver.chi_nhanh',{})
    available={'vi_do','kinh_do'} <= {c['name'] for c in table.get('columns',[])}
    prefix=(alias+'.') if alias else ''
    select=f'{prefix}vi_do AS latitude, {prefix}kinh_do AS longitude' if available else 'NULL::numeric AS latitude, NULL::numeric AS longitude'
    group=f', {prefix}vi_do, {prefix}kinh_do' if available else ''
    return select,group


def store_location(row):
    latitude,longitude=row.get('latitude'),row.get('longitude')
    try:
        if latitude is None or longitude is None or latitude=='' or longitude=='':
            return {'latitude':None,'longitude':None,'location_status':'missing'}
        if isinstance(latitude,bool) or isinstance(longitude,bool):raise ValueError()
        latitude,longitude=float(latitude),float(longitude)
        if not all(map(math.isfinite,(latitude,longitude))) or not -90<=latitude<=90 or not -180<=longitude<=180 or (latitude==0 and longitude==0):raise ValueError()
        return {'latitude':latitude,'longitude':longitude,'location_status':'recorded','location_source':'identity.chi_nhanh'}
    except (ValueError,TypeError,OverflowError):
        return {'latitude':None,'longitude':None,'location_status':'invalid'}
