package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestReleaseIdentity(t *testing.T) {
	e := echo.New()
	recorder := httptest.NewRecorder()
	if err := releaseIdentity(e.NewContext(httptest.NewRequest(http.MethodGet, "/_release", nil), recorder)); err != nil {
		t.Fatal(err)
	}
	if recorder.Code != http.StatusOK || recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("Unexpected release response: %d %v", recorder.Code, recorder.Header())
	}
	var identity map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &identity); err != nil {
		t.Fatal(err)
	}
	if identity["sha"] != releaseSHA || identity["version"] != releaseVersion {
		t.Fatalf("Unexpected identity: %v", identity)
	}
}
