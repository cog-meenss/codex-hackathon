# Command Patterns

## Recommended Command Schema

Use normalized commands that are independent of any one input source:

- `NEXT`
- `BACK`
- `START`
- `STOP`
- `MUTE`
- `UNMUTE`
- `TOGGLE_PLAY`
- `USER_PRESENT`
- `USER_AWAY`

## Source Mapping

Map raw input to commands, then commands to actions.

Examples:

- gesture `SWIPE_RIGHT` -> command `NEXT`
- gesture `SWIPE_LEFT` -> command `BACK`
- gesture `OPEN_PALM` -> command `TOGGLE_PLAY`
- voice `"next slide"` -> command `NEXT`
- motion timeout -> command `USER_AWAY`

## Action Mapping

Keep actions domain-specific and separate from command normalization.

Examples for a meeting controller:

- `NEXT` -> advance slide
- `BACK` -> previous slide
- `TOGGLE_PLAY` -> pause or resume timer
- `MUTE` -> toggle audio state
- `USER_AWAY` -> mark away and pause

## Reliability Checklist

- Add a cooldown per gesture class.
- Reject noisy frames with low confidence.
- Limit the live gesture vocabulary.
- Expose manual buttons for every important action.
- Log both command and action, not just raw input.
