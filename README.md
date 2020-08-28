# sibilant

detect speaking events from web audio

## installation

```sh
npm install @rifflearning/sibilant
```

## usage

Sibilant emits three different kinds of events after it's been hooked
up to a web audio stream:

- `speaking`: emitted continuously while voiced speech is detected
- `stoppedSpeaking`: emitted at the end of an utterance, with the start and end time of speech
- `volumeChanged`: emitted any time the volume of the audio stream changes

```javascript
import Sibilant from '@rifflearning/sibilant';

var speakingEvents = new Sibilant(stream)
speakingEvents.bind('speaking', function () {
    console.log('speaking!')
})
speakingEvents.bind('stoppedSpeaking', function (data) {
    console.log('Spoke!', 'start:', data.start, 'end:', data.end)
})
speakingEvents.bind('volumeChanged', function (data) {
    console.log('volume changed!', 'value:', data)
})
```

## license
MIT
