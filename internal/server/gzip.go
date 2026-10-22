package server

import (
	"compress/gzip"
	"net/http"
	"strconv"
	"strings"
)

// gzipResponseWriter compresses compressible text responses on the fly.
type gzipResponseWriter struct {
	http.ResponseWriter
	writer      *gzip.Writer
	method      string
	compress    bool
	wroteHeader bool
}

func (w *gzipResponseWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	header := w.Header()
	contentType := header.Get("Content-Type")

	if w.method != http.MethodHead &&
		status >= 200 && status < 300 &&
		status != http.StatusNoContent && status != http.StatusPartialContent &&
		header.Get("Content-Encoding") == "" &&
		header.Get("Content-Range") == "" &&
		compressibleContentType(contentType) {
		header.Add("Vary", "Accept-Encoding")
		w.compress = true
	}

	if w.compress {
		header.Set("Content-Encoding", "gzip")
		header.Del("Content-Length")
		w.writer = gzip.NewWriter(w.ResponseWriter)
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *gzipResponseWriter) Write(p []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if w.writer != nil {
		return w.writer.Write(p)
	}
	return w.ResponseWriter.Write(p)
}

func (w *gzipResponseWriter) Close() error {
	if w.writer == nil {
		return nil
	}
	return w.writer.Close()
}

func (w *gzipResponseWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// gzipResponses negotiates gzip for text-like responses. It deliberately skips
// HEAD, empty, range and already encoded responses.
func gzipResponses(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !acceptsGzip(r.Header.Get("Accept-Encoding")) {
			next.ServeHTTP(w, r)
			return
		}
		gw := &gzipResponseWriter{ResponseWriter: w, method: r.Method}
		defer func() {
			if err := gw.Close(); err != nil {
				// The response is already on the wire; nothing useful to do.
				_ = err
			}
		}()
		next.ServeHTTP(gw, r)
	})
}

func acceptsGzip(header string) bool {
	for _, part := range strings.Split(header, ",") {
		fields := strings.Split(strings.TrimSpace(part), ";")
		if !strings.EqualFold(strings.TrimSpace(fields[0]), "gzip") {
			continue
		}
		quality := 1.0
		for _, field := range fields[1:] {
			field = strings.TrimSpace(field)
			if !strings.HasPrefix(field, "q=") {
				continue
			}
			parsed, err := strconv.ParseFloat(strings.TrimPrefix(field, "q="), 64)
			if err == nil {
				quality = parsed
			}
		}
		return quality > 0
	}
	return false
}

func compressibleContentType(contentType string) bool {
	if contentType == "" {
		return false
	}
	base := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	switch base {
	case "application/json", "application/javascript", "application/xml",
		"application/xhtml+xml", "image/svg+xml":
		return true
	}
	return strings.HasPrefix(base, "text/")
}
