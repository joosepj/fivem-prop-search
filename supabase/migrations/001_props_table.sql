-- Enable pgvector
create extension if not exists vector;

-- Props table
create table if not exists props (
  id bigint generated always as identity primary key,
  name text not null unique,
  embedding vector(1536) -- text-embedding-3-small dimension
);

-- HNSW index for fast approximate nearest-neighbour search
create index if not exists props_embedding_idx
  on props
  using hnsw (embedding vector_cosine_ops);

-- Semantic search function called by the backend
create or replace function match_props(
  query_embedding vector(1536),
  match_count int default 20
)
returns table (
  id bigint,
  name text,
  similarity float
)
language plpgsql volatile
as $$
begin
  set local enable_seqscan = off;
  return query
  select
    p.id,
    p.name,
    (1 - (p.embedding <=> query_embedding))::float as similarity
  from props p
  order by p.embedding <=> query_embedding
  limit match_count;
end;
$$;
