package gql

// This file will not be regenerated automatically.
//
// Connection/Edge types for every paginated field are generic
// instantiations of internal/page's relay helper, bound to gqlgen via
// gqlgen.yml's models config rather than left for gqlgen to generate.

import (
	"github.com/load-bearing-code/stasher/api/internal/page"
	"github.com/load-bearing-code/stasher/api/internal/performers"
	"github.com/load-bearing-code/stasher/api/internal/platformaccounts"
	"github.com/load-bearing-code/stasher/api/internal/platforms"
	"github.com/load-bearing-code/stasher/api/internal/studios"
)

type (
	PlatformConnection = page.Connection[*platforms.Platform]
	PlatformEdge       = page.Edge[*platforms.Platform]

	StudioConnection = page.Connection[*studios.Studio]
	StudioEdge       = page.Edge[*studios.Studio]

	PerformerConnection = page.Connection[*performers.Performer]
	PerformerEdge       = page.Edge[*performers.Performer]

	PlatformAccountConnection = page.Connection[*platformaccounts.PlatformAccount]
	PlatformAccountEdge       = page.Edge[*platformaccounts.PlatformAccount]
)
