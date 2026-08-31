package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestReleaseIdentity(t *testing.T) {
	previousCommit, previousVersion := releaseCommit, releaseVersion
	releaseCommit, releaseVersion = "0123456789abcdef", "1.2.3"
	t.Cleanup(func() {
		releaseCommit, releaseVersion = previousCommit, previousVersion
	})

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/_release", nil)
	rec := httptest.NewRecorder()
	ctx := e.NewContext(req, rec)

	if err := (&Server{}).ReleaseIdentity(ctx); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}

	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["commitSha"] != releaseCommit || body["version"] != releaseVersion {
		t.Fatalf("body = %#v", body)
	}
}
