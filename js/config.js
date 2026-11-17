/* ------------------------------------------------------------------
   TIMELINE CONFIG  — everything is expressed as a FRACTION (0..1) of
   the total journey, so you only have to change DURATION to re-time
   the whole film to your piece of music.

   DURATION : total seconds from first star to touchdown.
              Override from the URL:  index.html?d=120
   Debug    : index.html?debug  -> shows clock, arrow keys scrub ±5s
              index.html?t=60    -> start at 60s (no music)
------------------------------------------------------------------- */
window.CFG = {
  DURATION: 86,             // matches audio/zarathustra.mp3 (original length, 1:26)
  // moments (seconds) where the music hits; the picture pulses with them
  HITS: [5, 21, 40, 55],
  MODAL_DELAY: 1.5,           // seconds after touchdown film ends before the first mission appears
  TITLE_HOLD: 1.2,          // seconds the WELCOME TO MARS card stays after the film ends
  AUDIO_SRC: 'audio/zarathustra.mp3',
  // one real keystroke from this recording is played per typed character (keystroke times: audio/typing-hits.json)
  TYPE_SFX: { src: 'audio/typing.mp3', hits: 'audio/typing-hits.json', volume: 0.12 },

  // Phases (fractions of DURATION)
  P: {
    fadeIn:   [0.000, 0.035],
    flyover:  [0.035, 0.430],   // giant ship passes overhead, camera looking up
    turn:     [0.395, 0.490],   // camera comes down to the horizon, Mars appears
    approach: [0.430, 0.790],   // chase the ship toward Mars
    entry:    [0.790, 0.875],   // atmosphere entry -> flash
    surface:  [0.875, 1.000],   // landing on Mars
    touchdown: 0.958,
    flash:    [0.858, 0.905],   // white-hot flash covering the scene swap
    fadeOut:  [0.985, 1.000]
  },

  // Typed text.  at/end are fractions of DURATION.
  // head = highlighted line, body = typed description.
  TEXT: [
    { at: 0.040, end: 0.094, head: 'OVER A MILLION YEARS AGO  ·  FIRE',
      body: 'We tamed the flame. The night stopped being the end of the day.' },
    { at: 0.098, end: 0.152, head: '3500 BC  ·  THE WHEEL',
      body: 'Distance became something we could shorten. We outran our own legs.' },
    { at: 0.156, end: 0.210, head: '1440  ·  THE PRINTING PRESS',
      body: 'Knowledge escaped the few. Ideas began to outrun armies.' },
    { at: 0.214, end: 0.268, head: '1769 – 1879  ·  STEAM AND ELECTRICITY',
      body: 'Engines that never tire. Light that never sleeps. The world shrank.' },
    { at: 0.272, end: 0.326, head: '1903  ·  KITTY HAWK',
      body: 'Twelve seconds above the sand rewrote the word impossible.' },
    { at: 0.330, end: 0.384, head: '1957 – 1969  ·  SPUTNIK TO APOLLO',
      body: 'In twelve years we went from a beeping sphere to footprints on the Moon.' },
    { at: 0.388, end: 0.440, head: '1989 – 2015  ·  THE NETWORK  &  THE REUSABLE ROCKET',
      body: 'Every mind connected. Every booster reusable. No excuses left.' },

    { at: 0.470, end: 0.560, head: 'EVERY STEP WAS A STEP TOWARD THIS',
      body: 'A thousand generations of curiosity, compressed into a single ship.' },
    { at: 0.572, end: 0.670, head: 'DESTINATION  ·  MARS',
      body: 'Two hundred and twenty-five million kilometres from home. Seven months of silence. No turning back.' },
    { at: 0.682, end: 0.775, head: 'WE DID NOT FIND A NEW WORLD',
      body: 'We became a species that builds them.' },
    { at: 0.790, end: 0.852, head: 'ATMOSPHERIC ENTRY',
      body: 'Hold on.', fast: true },

    { at: 0.915, end: 0.968, head: 'THE LONG DESCENT',
      body: 'Dust older than our oceans rises to greet us.', fast: true }
  ],

  // Final title card
  TITLE: { at: 0.968, end: 1.0, text: 'WELCOME TO MARS' }
};
