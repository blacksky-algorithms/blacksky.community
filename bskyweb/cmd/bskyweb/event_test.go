package main

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/flosch/pongo2/v6"
)

func decodeEvents(t *testing.T, body string) *getEventsOutput {
	t.Helper()
	var out getEventsOutput
	if err := json.Unmarshal([]byte(body), &out); err != nil {
		t.Fatal(err)
	}
	return &out
}

func TestEventPreviewFromOutput(t *testing.T) {
	ev := eventPreviewFromOutput(decodeEvents(t, `{"events":[{"thumb":"https://cdn/img@jpeg","record":{"name":"Block party","description":"Bring a dish"}}]}`))
	if ev == nil || ev.Name != "Block party" || ev.Description != "Bring a dish" || ev.Thumb != "https://cdn/img@jpeg" {
		t.Fatalf("unexpected preview: %+v", ev)
	}
}

func TestEventPreviewFromOutput_MissingOrNameless(t *testing.T) {
	for _, body := range []string{
		`{"events":[]}`,
		`{"events":[{"record":{"description":"no name"}}]}`,
		`{"events":[{"record":"not an object"}]}`,
	} {
		if ev := eventPreviewFromOutput(decodeEvents(t, body)); ev != nil {
			t.Errorf("expected nil for %s, got %+v", body, ev)
		}
	}
}

func TestRenderEvent_OpenGraph(t *testing.T) {
	html := renderTemplate(t, "event.html", pongo2.Context{
		"brandName":   "Blacksky",
		"requestURI":  "https://blacksky.community/event/bob.test/3kabc",
		"title":       "Block party",
		"description": "Bring a dish",
		"imgThumbUrl": "https://ogcard.example/event/did:plc:bob/3kabc",
	})
	for _, want := range []string{
		`<title>Block party - Blacksky</title>`,
		`<meta property="og:title" content="Block party" />`,
		`<meta property="og:description" content="Bring a dish" />`,
		`<meta property="og:image" content="https://ogcard.example/event/did:plc:bob/3kabc">`,
		`<meta name="twitter:card" content="summary_large_image" />`,
	} {
		if !strings.Contains(html, want) {
			t.Errorf("missing %s in:\n%s", want, html)
		}
	}
}

func TestRenderEvent_NoDescriptionFallback(t *testing.T) {
	html := renderTemplate(t, "event.html", pongo2.Context{"brandName": "Blacksky", "title": "Block party"})
	if !strings.Contains(html, `<meta property="og:description" content="An event on Blacksky" />`) {
		t.Errorf("missing fallback description:\n%s", html)
	}
}
