package page

import (
	"context"
	"errors"
)

// Edge is a Connection row: its cursor plus the node data for that row.
type Edge[T any] struct {
	Cursor string
	Node   T
}

// PageInfo is relay's cursor pagination page info, shared by every
// Connection type. See https://relay.dev/graphql/connections.htm.
type PageInfo struct {
	HasNextPage     bool
	HasPreviousPage bool
	StartCursor     *string
	EndCursor       *string
}

// Connection is a relay Connection: the current page's edges plus
// PageInfo describing where it sits in the full list. count is a
// closure rather than a precomputed value so a COUNT(*) only runs when
// a client actually selects totalCount.
type Connection[T any] struct {
	Edges    []*Edge[T]
	PageInfo *PageInfo

	count func(context.Context) (int, error)
}

// TotalCount is bound by gqlgen to the totalCount field.
func (c *Connection[T]) TotalCount(ctx context.Context) (int, error) {
	if c.count == nil {
		return 0, errors.New("page: totalCount not supported for this connection")
	}
	return c.count(ctx)
}

// NewConnection builds a Connection from a repository's Result, encoding
// each item's cursor via cursor. hasPrev is true whenever the request
// was for a page after the first (i.e. Args.After was set), since a
// keyset query has no cheaper way to know if earlier rows exist. count
// should cover the whole filtered set (ignoring Args.After) rather than
// just the rows after the cursor.
func NewConnection[T any](res Result[T], hasPrev bool, cursor func(T) Cursor, count func(context.Context) (int, error)) *Connection[T] {
	edges := make([]*Edge[T], len(res.Items))
	for i, item := range res.Items {
		edges[i] = &Edge[T]{Cursor: cursor(item).Encode(), Node: item}
	}

	info := &PageInfo{HasNextPage: res.HasNext, HasPreviousPage: hasPrev}
	if n := len(edges); n > 0 {
		info.StartCursor = &edges[0].Cursor
		info.EndCursor = &edges[n-1].Cursor
	}
	return &Connection[T]{Edges: edges, PageInfo: info, count: count}
}
