-- Add prompt_text column to analyses table for prompt-first search
alter table analyses add column if not exists prompt_text text;

comment on column analyses.prompt_text is 'User-entered text prompt for prompt-first search (alternative to image upload)';
