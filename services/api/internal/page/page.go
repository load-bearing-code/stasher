// Package page implements relay-style keyset cursor pagination shared by
// every Connection field: a cursor pairs a sort key with the row's id so
// decoding it is enough for a repository to resume a SQL query with
// `WHERE (sort_key, id) > (?, ?)` rather than an offset, keeping pages
// stable as rows are inserted or removed ahead of the cursor.
package page

import (
	"encoding/base64"
	"encoding/json"
	"errors"
)

// ErrBadCursor is returned by Decode when a cursor is malformed, either
// because it isn't valid base64 or doesn't unmarshal into Cursor.
var ErrBadCursor = errors.New("page: malformed cursor")

// Cursor pairs a sort key (the column a list is ordered by, as a string
// so both textual and formatted-timestamp keys fit) with the row's id, a
// tiebreaker guaranteeing a stable order when the sort key isn't unique
// on its own.
type Cursor struct {
	Key string `json:"k"`
	ID  string `json:"i"`
}

// Encode renders c as the opaque string a GraphQL client treats as a
// cursor.
func (c Cursor) Encode() string {
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}

// Decode reverses Encode.
func Decode(s string) (*Cursor, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, ErrBadCursor
	}
	var c Cursor
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, ErrBadCursor
	}
	return &c, nil
}

// Args is a page of a Connection field's arguments, decoded from GraphQL's
// first/after into the shape a repository's keyset query needs.
type Args struct {
	First int
	After *Cursor
}

// DefaultFirst and MaxFirst bound every Connection field's `first`
// argument: a sane page size when the client omits it, and a cap
// against a client asking for an unreasonably large page.
const (
	DefaultFirst = 20
	MaxFirst     = 100
)

// ParseArgs decodes a Connection field's first/after GraphQL arguments
// into Args, clamping first to [1, MaxFirst] (defaulting to
// DefaultFirst when nil) and rejecting a malformed after cursor.
func ParseArgs(first *int, after *string) (Args, error) {
	args := Args{First: DefaultFirst}
	if first != nil {
		args.First = min(max(*first, 1), MaxFirst)
	}
	if after != nil {
		c, err := Decode(*after)
		if err != nil {
			return Args{}, err
		}
		args.After = c
	}
	return args, nil
}

// Result is a repository's answer to Args: the page's rows, already
// trimmed to First, and whether another page follows.
type Result[T any] struct {
	Items   []T
	HasNext bool
}
