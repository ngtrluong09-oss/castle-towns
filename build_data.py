"""Build app/data/castle_towns.json from castle_towns_v2.csv (no values invented; only reshaped).
URL fields are split into lists; one malformed Wikidata URL pattern is normalised (logged)."""
import json, math, re, shutil, pandas as pd
SRC='castle_towns_v2.csv'
d=pd.read_csv(SRC,dtype={'municipal_code':str})
fixes=[]
def urls(v,field,code):
    if v is None or (isinstance(v,float) and math.isnan(v)): return []
    out=[]
    for u in re.split(r'\s*\|\s*|\s+',str(v).strip()):
        if not u: continue
        m=re.match(r'https://www\.wikidata\.org/wiki/https?://www\.wikidata\.org/entity/(Q\d+)$',u)
        if m:
            nu='https://www.wikidata.org/wiki/'+m.group(1); fixes.append((code,field,u,nu)); u=nu
        out.append(u)
    return out
def val(v):
    if v is None: return None
    if isinstance(v,float):
        if math.isnan(v): return None
        return v
    if hasattr(v,'item'): v=v.item()
    if isinstance(v,str) and v in ('True','False'): return v=='True'
    return v
URLCOLS=[c for c in d.columns if c.endswith('_url') or c.endswith('_urls')]
rows=[]
for i,r in d.iterrows():
    o={c:val(r[c]) for c in d.columns if c not in URLCOLS}
    o['id']=i
    o['municipal_code']=r['municipal_code']
    for c in URLCOLS: o[c]=urls(r[c],c,r['municipal_code'])
    o['validation_flags']=[f for f in str(r['validation_flags']).split(';') if f and f!='nan']
    o['is_former_town_row']=str(r['merger_type']).startswith('castle_town_absorbed')
    rows.append(o)
sources=pd.read_csv('sources_v2.csv').to_dict('records')
stats=json.load(open('stats_v2.json'))
meta={'dataset':'castle_towns_v2','built_from':SRC,'rows':len(rows),
 'distance_method':'Haversine great-circle (straight-line) distance, km, castle point -> station platform centroid (MLIT N02-2023); geodesic WGS84 value in *_geodesic_km. Not walking distance.',
 'citation_fields':{'castle coordinates':'castle_coord_source + castle_coord_source_url','castle status':'castle_type_source_url','castle article':'castle_wikipedia_ja_url',
   'castle-town list membership':'castle_town_list_source_urls','station_main':'station_main_source_url','station_central':'station_central_source_url',
   'population / density':'population_source + population_source_url (+ census_excel_row)','area':'area_source_url','former municipality':'former_municipality_source_url',
   'layout':'castle_layout_source_url','festival (draft)':'festival_status + festival_source_url'},
 'url_fixes':[{'municipal_code':a,'field':b,'from':c,'to':e} for a,b,c,e in fixes],
 'matsue_band_rule':'both = 0.5x-1.5x of Matsue population AND density; population_only / density_only / outside otherwise (pop_vs_matsue_pct, density_vs_matsue_pct = % of Matsue)'}
json.dump({'meta':meta,'sources':sources,'stats':stats,'rows':rows},open('app/data/castle_towns.json','w'),ensure_ascii=False,separators=(',',':'),allow_nan=False)
shutil.copy(SRC,'app/data/castle_towns_v2.csv'); shutil.copy('sources_v2.csv','app/data/sources_v2.csv'); shutil.copy('stats_v2.json','app/data/stats_v2.json')
print(len(rows),'rows; url fixes:',len(fixes))
