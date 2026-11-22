import { format as sqlFormat, type SqlLanguage } from 'sql-formatter'

export type SqlDialect = 'sql' | 'mysql' | 'postgresql' | 'sqlite' | 'bigquery' | 'tsql'
export type SqlKeywordCase = 'upper' | 'lower' | 'preserve'

export const SQL_DIALECTS: Array<{ id: SqlDialect; label: string }> = [
  { id: 'sql', label: 'Standard SQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'bigquery', label: 'BigQuery' },
  { id: 'tsql', label: 'T-SQL' },
]

export const SQL_SAMPLES: Array<{ id: string; labelZh: string; labelEn: string; dialect: SqlDialect; sql: string }> = [
  {
    id: 'analytics',
    labelZh: '多表聚合 CTE',
    labelEn: 'Analytics CTE',
    dialect: 'postgresql',
    sql: `with active_orders as (select o.user_id, count(*) as order_count, sum(o.total_cents) / 100.0 as gmv from orders o where o.status in ('paid', 'shipped') and o.created_at >= '2026-01-01' group by o.user_id) select u.id, u.name, u.region, ao.order_count, ao.gmv from users u inner join active_orders ao on ao.user_id = u.id where ao.gmv >= 500 order by ao.gmv desc limit 20;`,
  },
  {
    id: 'mysql-ddl',
    labelZh: 'MySQL 建表',
    labelEn: 'MySQL DDL',
    dialect: 'mysql',
    sql: `create table if not exists api_tokens (id bigint unsigned auto_increment primary key, user_id bigint unsigned not null, token_hash char(64) not null, scopes json not null, expires_at datetime null, created_at timestamp default current_timestamp, unique key uk_token_hash (token_hash), key idx_user_exp (user_id, expires_at)) engine=InnoDB default charset=utf8mb4;`,
  },
  {
    id: 'window',
    labelZh: '窗口函数排名',
    labelEn: 'Window Rank',
    dialect: 'sql',
    sql: `select dept, employee_name, salary, dense_rank() over (partition by dept order by salary desc) as dept_rank from employees where active = 1 and hire_date >= '2023-01-01' order by dept asc, dept_rank asc;`,
  },
]

export function formatSqlCode(
  input: string,
  options?: {
    dialect?: SqlDialect
    keywordCase?: SqlKeywordCase
    tabWidth?: number
  },
): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const dialect: SqlLanguage = options?.dialect ?? 'sql'
  const keywordCase = options?.keywordCase ?? 'upper'
  const tabWidth = options?.tabWidth === 4 ? 4 : 2

  return sqlFormat(trimmed, {
    language: dialect,
    keywordCase,
    tabWidth,
    linesBetweenQueries: 2,
  }).trimEnd()
}

export function minifySqlCode(input: string): string {
  let out = ''
  let inQuote: "'" | '"' | '`' | null = null
  let prevSpace = false
  let i = 0

  while (i < input.length) {
    const ch = input[i]
    const next = input[i + 1]

    if (inQuote) {
      out += ch
      if (ch === inQuote) {
        if (next === inQuote) {
          out += next
          i += 2
          continue
        }
        inQuote = null
      } else if (ch === '\\' && next) {
        out += next
        i += 2
        continue
      }
      i += 1
      continue
    }

    if (ch === '-' && next === '-') {
      while (i < input.length && input[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inQuote = ch
      out += ch
      prevSpace = false
      i += 1
      continue
    }
    if (/\s/.test(ch)) {
      if (!prevSpace && out.length > 0) {
        out += ' '
        prevSpace = true
      }
      i += 1
      continue
    }
    out += ch
    prevSpace = false
    i += 1
  }

  return out.trim()
}
