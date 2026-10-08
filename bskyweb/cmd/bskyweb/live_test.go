package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	appbsky "github.com/bluesky-social/indigo/api/bsky"
	"github.com/hashicorp/golang-lru/v2/expirable"
)

func TestLiveStreamTitle(t *testing.T) {
	active, inactive := true, false
	view := func(status string, isActive *bool) *appbsky.ActorDefs_ProfileViewDetailed {
		return &appbsky.ActorDefs_ProfileViewDetailed{Status: &appbsky.ActorDefs_StatusView{
			Status:   status,
			IsActive: isActive,
			Embed: &appbsky.ActorDefs_StatusView_Embed{EmbedExternal_View: &appbsky.EmbedExternal_View{
				External: &appbsky.EmbedExternal_ViewExternal{Title: "Off Protocol LIVE"},
			}},
		}}
	}
	cases := []struct {
		name string
		pv   *appbsky.ActorDefs_ProfileViewDetailed
		want string
	}{
		{"active", view("app.bsky.actor.status#live", &active), "Off Protocol LIVE"},
		{"no expiry", view("app.bsky.actor.status#live", nil), "Off Protocol LIVE"},
		{"expired", view("app.bsky.actor.status#live", &inactive), ""},
		{"other status", view("app.bsky.actor.status#other", &active), ""},
		{"no status", &appbsky.ActorDefs_ProfileViewDetailed{}, ""},
	}
	for _, c := range cases {
		if got := liveStreamTitle(c.pv); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestImageAvailable(t *testing.T) {
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
	}))
	defer ok.Close()
	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer broken.Close()
	notImage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
	}))
	defer notImage.Close()
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
	}))
	defer slow.Close()

	client := &http.Client{Timeout: 50 * time.Millisecond}
	cases := []struct {
		name string
		url  string
		want bool
	}{
		{"ok", ok.URL, true},
		{"error status", broken.URL, false},
		{"not an image", notImage.URL, false},
		{"timeout", slow.URL, false},
	}
	for _, c := range cases {
		if got := imageAvailable(context.Background(), client, c.url); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestLiveImageFallbacks(t *testing.T) {
	active := true
	thumb, banner := "https://cdn.example/thumb.jpg", "https://cdn.example/banner.jpg"
	live := &appbsky.ActorDefs_ProfileViewDetailed{
		Banner: &banner,
		Status: &appbsky.ActorDefs_StatusView{
			Status:   "app.bsky.actor.status#live",
			IsActive: &active,
			Embed: &appbsky.ActorDefs_StatusView_Embed{EmbedExternal_View: &appbsky.EmbedExternal_View{
				External: &appbsky.EmbedExternal_ViewExternal{Thumb: &thumb},
			}},
		},
	}
	card, def := "https://stream.place/card", "https://static/default.png"
	cases := []struct {
		name   string
		pv     *appbsky.ActorDefs_ProfileViewDetailed
		cardOK bool
		want   string
	}{
		{"card ok", live, true, card},
		{"card failed uses status thumb", live, false, thumb},
		{"no status uses banner", &appbsky.ActorDefs_ProfileViewDetailed{Banner: &banner}, false, banner},
		{"nothing uses default", &appbsky.ActorDefs_ProfileViewDetailed{}, false, def},
	}
	for _, c := range cases {
		if got := liveImage(c.pv, card, c.cardOK, def); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestLiveCardAvailableCaches(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Header().Set("Content-Type", "image/jpeg")
	}))
	defer srv.Close()
	s := &Server{
		liveCardClient: http.Client{Timeout: time.Second},
		liveCardCache:  expirable.NewLRU[string, bool](10, nil, time.Minute),
	}
	for i := 0; i < 3; i++ {
		if !s.liveCardAvailable(context.Background(), srv.URL) {
			t.Fatal("expected card available")
		}
	}
	if hits != 1 {
		t.Errorf("expected 1 upstream request, got %d", hits)
	}
}
