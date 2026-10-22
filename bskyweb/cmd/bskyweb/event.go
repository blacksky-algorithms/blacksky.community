package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	appbsky "github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/atproto/syntax"
	"github.com/bluesky-social/indigo/xrpc"
	"github.com/labstack/echo/v4"
)

type eventPreview struct {
	Name        string
	Description string
	Thumb       string
}

type eventRecordFields struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type getEventsOutput struct {
	Events []struct {
		Thumb  string          `json:"thumb"`
		Record json.RawMessage `json:"record"`
	} `json:"events"`
}

func (srv *Server) fetchEventPreview(ctx context.Context, did, rkey string) (*eventPreview, error) {
	uri := fmt.Sprintf("at://%s/community.lexicon.calendar.event/%s", did, rkey)
	var out getEventsOutput
	params := map[string]any{"uris": uri}
	if err := srv.xrpcc.Do(ctx, xrpc.Query, "", "community.blacksky.calendar.getEvents", params, nil, &out); err != nil {
		return nil, err
	}
	return eventPreviewFromOutput(&out), nil
}

func eventPreviewFromOutput(out *getEventsOutput) *eventPreview {
	if len(out.Events) == 0 {
		return nil
	}
	var rec eventRecordFields
	if err := json.Unmarshal(out.Events[0].Record, &rec); err != nil || rec.Name == "" {
		return nil
	}
	return &eventPreview{
		Name:        rec.Name,
		Description: rec.Description,
		Thumb:       out.Events[0].Thumb,
	}
}

func (srv *Server) WebEvent(c echo.Context) error {
	req := c.Request()
	ctx := req.Context()
	data := srv.NewTemplateContext(req)
	data["requestURI"] = fmt.Sprintf("https://%s%s", req.Host, req.URL.Path)

	rkey, err := syntax.ParseRecordKey(c.Param("rkey"))
	if err != nil {
		return c.Render(http.StatusOK, "event.html", data)
	}
	handleOrDID, err := syntax.ParseAtIdentifier(c.Param("handleOrDID"))
	if err != nil {
		return c.Render(http.StatusOK, "event.html", data)
	}

	pv, err := appbsky.ActorGetProfile(ctx, srv.xrpcc, handleOrDID.Normalize().String())
	if err != nil {
		log.Warnf("failed to fetch profile for event host: %s\t%v", handleOrDID, err)
		return c.Render(http.StatusOK, "event.html", data)
	}
	if profileRequiresAuth(pv) {
		data["noindex"] = true
		data["nofollow"] = true
		return c.Render(http.StatusOK, "event.html", data)
	}

	ev, err := srv.fetchEventPreview(ctx, pv.Did, rkey.String())
	if err != nil {
		log.Warnf("failed to fetch event: %s/%s\t%v", pv.Did, rkey, err)
	}
	if ev == nil {
		return c.Render(http.StatusOK, "event.html", data)
	}

	data["title"] = ev.Name
	data["description"] = ev.Description
	if srv.cfg.ogcardHost != "" {
		data["imgThumbUrl"] = fmt.Sprintf("%s/event/%s/%s", srv.cfg.ogcardHost, pv.Did, rkey)
	} else if ev.Thumb != "" {
		data["imgThumbUrl"] = ev.Thumb
	}
	return c.Render(http.StatusOK, "event.html", data)
}
