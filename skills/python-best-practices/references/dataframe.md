# Dataframe Patterns

Always use vectorized columnar operations and method chaining. Never use `iterrows()`, row-by-row loops, or `apply()` when a vectorized alternative exists.

## Core Pattern: Vectorize and Chain

```python
# WRONG: row-by-row loop
for idx, row in df.iterrows():
    df.loc[idx, 'revenue'] = row['amount'] * row['quantity']

# CORRECT: vectorized column operation + method chaining
result = (df
    .assign(revenue=lambda x: x['amount'] * x['quantity'])
    .query('revenue > 1000')
    .groupby('region')
    .agg(total_revenue=('revenue', 'sum'), avg_price=('amount', 'mean'))
    .sort_values('total_revenue', ascending=False)
    .reset_index()
)
```

## Cross-Engine Equivalents

Use the same columnar mindset across engines. Pick the engine matching the project's scale.

### Pandas (small–medium data)

```python
result = (df
    .assign(revenue=lambda x: x['amount'] * x['quantity'])
    .query('revenue > 1000')
    .groupby('region')
    .agg({'revenue': 'sum'})
)
```

### Polars (large data, single-machine)

```python
result = (df
    .with_columns(revenue=pl.col('amount') * pl.col('quantity'))
    .filter(pl.col('revenue') > 1000)
    .group_by('region')
    .agg(pl.col('revenue').sum())
)
```

### DuckDB (SQL over files/dataframes)

```python
result = duckdb.query("""
    SELECT region, SUM(amount * quantity) AS total_revenue
    FROM 'sales_data.csv'
    WHERE (amount * quantity) > 1000
    GROUP BY region
""").to_df()
```

### Apache Spark (distributed)

```python
from pyspark.sql.functions import col

result = (df
    .withColumn('revenue', col('amount') * col('quantity'))
    .filter(col('revenue') > 1000)
    .groupBy('region')
    .agg({'revenue': 'sum'})
)
```

## Common Pitfalls

### Never use iterrows() for transformations

```python
# WRONG
for idx, row in df.iterrows():
    df.loc[idx, 'new_col'] = func(row['col1'])

# OK (non-vectorizable function)
df['new_col'] = df['col1'].apply(func)

# BEST (vectorizable)
df['new_col'] = vectorized_func(df['col1'])
```

### Never build DataFrames row-by-row

```python
# WRONG: repeated concat
result = pd.DataFrame()
for item in items:
    result = pd.concat([result, pd.DataFrame([item])])

# CORRECT: collect then construct
result = pd.DataFrame([process(item) for item in items])
```

### Chain instead of intermediate assignments

```python
# WRONG: separate assignments create copies
df = df.assign(col1=...)
df = df.assign(col2=...)
df = df.query(...)

# CORRECT: single pipeline
df = (df
    .assign(col1=..., col2=...)
    .query(...)
)
```

## Column Selection Quick Reference

```python
df['col']                   # Single column → Series
df[['col1', 'col2']]       # Multiple columns → DataFrame
df.loc[:, 'col1':'col3']   # Range selection
df.filter(['col1', 'col2']) # Explicit filtering
```

## Engine Selection Guide

| Scale | Engine | Notes |
|-------|--------|-------|
| < 1M rows | Pandas | Familiar API, rich ecosystem |
| 1M–100M rows | Polars | Rust-backed, 5–100x faster than Pandas |
| Files / ad-hoc SQL | DuckDB | Zero-copy, reads CSV/Parquet directly |
| > 100M rows / cluster | Spark | Distributed, horizontal scaling |
