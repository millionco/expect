\echo 'Makro database verification'

select 'countries' as table_name, count(*) as row_count from countries
union all
select 'sources' as table_name, count(*) as row_count from sources
union all
select 'indicators' as table_name, count(*) as row_count from indicators
union all
select 'indicator_components' as table_name, count(*) as row_count from indicator_components
order by table_name;

select
    count(*) filter (where is_primary_source) as primary_source_count,
    min(reliability_score) as min_reliability_score,
    max(reliability_score) as max_reliability_score
from sources;

select
    category,
    count(*) as indicator_count
from indicators
group by category
order by category;

select
    indicator_code,
    count(component_code) as component_count
from indicators
left join indicator_components on indicator_components.indicator_id = indicators.id
group by indicator_code
order by indicator_code;
