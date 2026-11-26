package mqtt

import (
	"testing"
	"time"

	"github.com/mqtt-home/unifi-access-mqtt/config"
)

func at(hour, minute int) time.Time {
	return time.Date(2026, 11, 26, hour, minute, 0, 0, time.FixedZone("CET", 3600))
}

func TestActiveAt(t *testing.T) {
	day := config.MotionBinding{From: "06:00", Until: "19:00"}
	night := config.MotionBinding{From: "22:00", Until: "05:30"}

	cases := []struct {
		name    string
		binding config.MotionBinding
		now     time.Time
		want    bool
	}{
		{"no window", config.MotionBinding{}, at(3, 0), true},
		{"before the day", day, at(5, 59), false},
		{"day begins", day, at(6, 0), true},
		{"day", day, at(12, 0), true},
		{"last minute", day, at(18, 59), true},
		{"day ends", day, at(19, 0), false},
		{"night", day, at(2, 0), false},
		{"over midnight, evening", night, at(23, 0), true},
		{"over midnight, morning", night, at(5, 29), true},
		{"over midnight, ended", night, at(5, 30), false},
		{"over midnight, day", night, at(12, 0), false},
		{"only from", config.MotionBinding{From: "06:00"}, at(23, 59), true},
		{"only from, early", config.MotionBinding{From: "06:00"}, at(5, 0), false},
		{"only until", config.MotionBinding{Until: "19:00"}, at(0, 0), true},
		{"only until, late", config.MotionBinding{Until: "19:00"}, at(20, 0), false},
		{"invalid stays active", config.MotionBinding{From: "6 Uhr", Until: "19:00"}, at(2, 0), true},
		{"empty window stays active", config.MotionBinding{From: "08:00", Until: "08:00"}, at(2, 0), true},
	}
	for _, c := range cases {
		if got := activeAt(c.binding, c.now); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
