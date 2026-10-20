// Package web embeds the HTML templates and static assets so the server can
// run from a single binary.
package web

import (
	"embed"
	"io/fs"
)

//go:embed templates/*.html
var templateFiles embed.FS

//go:embed static
var staticFiles embed.FS

// Templates returns the embedded template files.
func Templates() fs.FS { return templateFiles }

// Static returns the embedded static directory as a rooted filesystem.
func Static() fs.FS {
	sub, err := fs.Sub(staticFiles, "static")
	if err != nil {
		panic("web: static assets are missing: " + err.Error())
	}
	return sub
}
