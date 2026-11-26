package mqtt

import (
	"time"

	"github.com/mqtt-home/unifi-access-mqtt/config"
	"github.com/mqtt-home/unifi-access-mqtt/unifi"
	"github.com/philipparndt/go-logger"
	"github.com/philipparndt/mqtt-gateway/mqtt"
)

// MotionListener subscribes to external MQTT motion-sensor topics and wakes
// the configured UniFi Access viewers when the trigger value is observed.
type MotionListener struct {
	controller *unifi.Controller
	waker      *unifi.ViewerWaker
	bindings   []config.MotionBinding
}

// NewMotionListener creates a listener for the given motion bindings.
func NewMotionListener(controller *unifi.Controller, waker *unifi.ViewerWaker, bindings []config.MotionBinding) *MotionListener {
	return &MotionListener{
		controller: controller,
		waker:      waker,
		bindings:   bindings,
	}
}

// Start subscribes to all configured topics. Must be called after mqtt.Start
// and waker.Connect.
func (l *MotionListener) Start() {
	for i := range l.bindings {
		binding := l.bindings[i]

		if binding.Topic == "" {
			logger.Warn("wake-on-motion: skipping binding with empty topic")
			continue
		}

		if _, ok := minuteOfDay(binding.From, 0); !ok {
			logger.Warn("wake-on-motion: invalid from, the binding is always active", "topic", binding.Topic, "from", binding.From)
		}
		if _, ok := minuteOfDay(binding.Until, 0); !ok {
			logger.Warn("wake-on-motion: invalid until, the binding is always active", "topic", binding.Topic, "until", binding.Until)
		}

		mqtt.Subscribe(binding.Topic, func(_ string, payload []byte) {
			l.handle(binding, payload)
		})
		logger.Info("wake-on-motion: subscribed",
			"topic", binding.Topic, "field", binding.Field, "from", binding.From, "until", binding.Until)
	}
}

// activeAt reports whether the binding may wake viewers at the given time:
// always without From/Until, otherwise from From up to (not including) Until
// in the time's own zone. A window with Until before From runs over midnight.
func activeAt(b config.MotionBinding, now time.Time) bool {
	if b.From == "" && b.Until == "" {
		return true
	}
	from, okFrom := minuteOfDay(b.From, 0)
	until, okUntil := minuteOfDay(b.Until, 24*60)
	if !okFrom || !okUntil || from == until {
		return true
	}
	minute := now.Hour()*60 + now.Minute()
	if from < until {
		return minute >= from && minute < until
	}
	return minute >= from || minute < until
}

// minuteOfDay parses "HH:MM"; an empty value yields the fallback.
func minuteOfDay(value string, fallback int) (int, bool) {
	if value == "" {
		return fallback, true
	}
	t, err := time.Parse("15:04", value)
	if err != nil {
		return 0, false
	}
	return t.Hour()*60 + t.Minute(), true
}

func (l *MotionListener) handle(b config.MotionBinding, payload []byte) {
	matched, value, ok := matchPayload(payload, b.Field, b.Value)
	if !ok {
		logger.Debug("wake-on-motion: payload could not be matched",
			"topic", b.Topic, "field", b.Field)
		return
	}
	if !matched {
		logger.Trace("wake-on-motion: value does not match",
			"topic", b.Topic, "field", b.Field, "value", value)
		return
	}

	if !activeAt(b, time.Now()) {
		logger.Debug("wake-on-motion: outside the binding's hours, not waking",
			"topic", b.Topic, "from", b.From, "until", b.Until)
		return
	}

	viewers := b.Viewers
	if len(viewers) == 0 {
		viewers = l.controller.GetViewerIDs()
	}
	if len(viewers) == 0 {
		logger.Warn("wake-on-motion: no viewers to wake",
			"topic", b.Topic)
		return
	}

	source := b.SourceReader
	if source == "" {
		source = l.controller.GetDoorbellSourceReader()
	}

	logger.Info("wake-on-motion: motion detected, waking viewers",
		"topic", b.Topic, "viewers", viewers, "source", source)
	if err := l.waker.Wake(viewers, source); err != nil {
		logger.Warn("wake-on-motion: wake failed",
			"topic", b.Topic, "err", err)
	}
}
