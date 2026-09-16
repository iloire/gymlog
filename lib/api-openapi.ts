import { EXERCISES_DEFAULT_LIMIT, EXERCISES_MAX_LIMIT, HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT, WEEKDAYS } from '@/lib/api'

/**
 * OpenAPI 3.1 description of `/api/v1`, served at `/api/v1/openapi.json`.
 * Written for the model that reads it as much as for a person: descriptions say
 * what each endpoint is for, which token it needs, and how to read the numbers.
 * Keep it in step with `lib/api.ts` and `lib/api-write.ts` — a test checks that
 * every documented operation is a route export and the other way round.
 */

const nullable = (type: string) => ({ type: [type, 'null'] })
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const json = (schema: unknown) => ({ 'application/json': { schema } })

const dateParam = (name: 'from' | 'to', description: string) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema: { type: 'string', format: 'date', example: '2026-09-01' },
})

const limitParam = (fallback: number, max: number) => ({
  name: 'limit',
  in: 'query',
  required: false,
  description: `Most results to return (default ${fallback}, max ${max}).`,
  schema: { type: 'integer', minimum: 1, maximum: max, default: fallback },
})

const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } }

const errors = {
  '400': { description: 'The request did not match this schema; `issues` says where.', content: json(ref('Error')) },
  '401': { description: 'Missing, unknown or revoked token.', content: json(ref('Error')) },
}
const writeErrors = {
  ...errors,
  '403': { description: 'The token is read only.', content: json(ref('Error')) },
}

const WRITE = ' Needs a read and write token.'

export function openApiSpec(origin: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'gymlog',
      version: '1.1.0',
      description:
        "One person's training log: their programme, workouts, the sessions they trained with every " +
        'set, and their bodyweight. A read only token can call every GET; a read and write token can ' +
        'also create and change workouts, set the weekly schedule and record bodyweight — changes reach ' +
        "the person's phone on its next sync. Logged sessions cannot be changed through the API. " +
        'All weights are kilograms; the profile says whether the person prefers to see kg or lb. ' +
        'Dates are local calendar dates (YYYY-MM-DD). Volume is the sum of weight × reps over working ' +
        'sets, warm-ups excluded. Before changing anything, read /profile and /workouts, and tell the ' +
        'person what you are about to change.',
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'A token created in gymlog under Profile → API access. Starts with gymlog_.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            issues: { type: 'array', items: { type: 'string' } },
          },
        },
        Exercise: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Use as exerciseId in a workout.' },
            name: { type: 'string' },
            equipment: nullable('string'),
            primaryMuscles: { type: ['array', 'null'], items: { type: 'string' } },
            level: nullable('string'),
            category: { ...nullable('string'), description: 'cardio exercises are logged as time, not weight × reps.' },
            own: { type: 'boolean', description: 'Created by this person rather than from the shared library.' },
          },
        },
        WorkoutExercise: {
          type: 'object',
          properties: {
            exerciseId: { type: 'string' },
            exercise: { type: 'string' },
            equipment: nullable('string'),
            primaryMuscles: { type: ['array', 'null'], items: { type: 'string' } },
            sets: { type: 'integer' },
            targetReps: { type: 'integer' },
            targetRepsMax: nullable('integer'),
            targetWeightKg: nullable('number'),
            targetDurationSec: { ...nullable('integer'), description: 'Cardio: prescribed seconds. Null for weight × reps.' },
            restSec: { type: 'integer' },
            notes: nullable('string'),
          },
        },
        Workout: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            notes: nullable('string'),
            exercises: { type: 'array', items: ref('WorkoutExercise') },
          },
        },
        WorkoutInput: {
          type: 'object',
          required: ['name', 'exercises'],
          properties: {
            name: { type: 'string', maxLength: 80 },
            notes: { ...nullable('string'), maxLength: 1000 },
            exercises: {
              type: 'array',
              maxItems: 40,
              description: 'In the order they are performed.',
              items: {
                type: 'object',
                required: ['exerciseId', 'sets', 'targetReps'],
                properties: {
                  exerciseId: { type: 'string', description: 'From GET /exercises.' },
                  sets: { type: 'integer', minimum: 1, maximum: 20 },
                  targetReps: { type: 'integer', minimum: 1, maximum: 100, description: 'Or the bottom of a range.' },
                  targetRepsMax: { ...nullable('integer'), description: 'Top of a rep range such as 8–12.' },
                  targetWeightKg: { ...nullable('number'), minimum: 0, maximum: 1000 },
                  targetDurationSec: {
                    ...nullable('integer'),
                    minimum: 1,
                    maximum: 14400,
                    description:
                      'For cardio (category cardio, e.g. Stairmaster): seconds per set, logged as time instead of reps. Send sets 1 and targetReps 1 with it.',
                  },
                  restSec: { type: 'integer', minimum: 0, maximum: 1800, default: 90 },
                  notes: { ...nullable('string'), maxLength: 500 },
                },
              },
            },
          },
        },
        Programme: {
          type: ['object', 'null'],
          properties: {
            name: { type: 'string' },
            stage: nullable('string'),
            startedOn: { type: 'string', format: 'date' },
            notes: nullable('string'),
            week: {
              type: 'array',
              description: 'Training days only; any day not listed is a rest day.',
              items: {
                type: 'object',
                properties: {
                  day: { type: 'string', enum: WEEKDAYS },
                  workoutId: { type: 'string' },
                  workout: { type: 'string' },
                },
              },
            },
          },
        },
        Set: {
          type: 'object',
          properties: {
            set: { type: 'integer', description: 'Set number within the exercise, from 1.' },
            weightKg: nullable('number'),
            reps: nullable('integer'),
            durationSec: { ...nullable('integer'), description: 'Cardio: how long it lasted. Null for weight × reps sets.' },
            warmup: { type: 'boolean' },
            targetReps: { ...nullable('integer'), description: 'Prescribed reps (bottom of the range).' },
            targetRepsMax: { ...nullable('integer'), description: 'Top of a rep range such as 8–12.' },
            targetWeightKg: nullable('number'),
            targetDurationSec: nullable('integer'),
            notes: nullable('string'),
          },
        },
        Session: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date' },
            workout: { type: 'string', description: 'Workout name at the time it was trained.' },
            finished: { type: 'boolean', description: 'Whether Finish was tapped.' },
            durationMin: { ...nullable('integer'), description: 'First logged set to last.' },
            volumeKg: { type: 'number' },
            cardioMin: { type: 'number', description: 'Minutes of cardio logged.' },
            setsDone: { type: 'integer' },
            setsPlanned: { type: 'integer' },
            notes: nullable('string'),
            exercises: {
              type: 'array',
              description: 'Exercises in the order performed, each with its logged sets only.',
              items: {
                type: 'object',
                properties: { name: { type: 'string' }, sets: { type: 'array', items: ref('Set') } },
              },
            },
          },
        },
        Bodyweight: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date' },
            weightKg: { type: 'number' },
            notes: nullable('string'),
          },
        },
      },
    },
    paths: {
      '/profile': {
        get: {
          operationId: 'getProfile',
          summary: 'Name, preferred unit and current programme',
          description: 'Start here. The current programme lists which workout is on each weekday.',
          responses: {
            '200': {
              description: 'The profile.',
              content: json({
                type: 'object',
                properties: {
                  name: nullable('string'),
                  preferredUnit: { type: 'string', enum: ['kg', 'lb'] },
                  weightsAreIn: { type: 'string', const: 'kg' },
                  currentProgramme: ref('Programme'),
                },
              }),
            },
            '401': errors['401'],
          },
        },
      },
      '/programme/week': {
        put: {
          operationId: 'setWeek',
          summary: 'Set which workout is on each weekday',
          description:
            'Replaces the whole week of the current programme: days you leave out become rest days. ' +
            'Starts a programme if none is running.' +
            WRITE,
          requestBody: {
            required: true,
            content: json({
              type: 'object',
              required: ['week'],
              properties: {
                week: {
                  type: 'array',
                  maxItems: 7,
                  items: {
                    type: 'object',
                    required: ['day', 'workoutId'],
                    properties: {
                      day: { type: 'string', enum: WEEKDAYS },
                      workoutId: { type: 'string', description: 'From GET /workouts.' },
                    },
                  },
                },
              },
            }),
          },
          responses: { '200': { description: 'The programme as it now stands.', content: json(ref('Programme')) }, ...writeErrors },
        },
      },
      '/exercises': {
        get: {
          operationId: 'searchExercises',
          summary: 'Search the exercise library',
          description: 'Find the exerciseId to use in a workout. Names are English, e.g. "Barbell Squat".',
          parameters: [
            { name: 'q', in: 'query', required: false, description: 'Part of the exercise name.', schema: { type: 'string' } },
            {
              name: 'equipment',
              in: 'query',
              required: false,
              description: 'Exact equipment, e.g. barbell, dumbbell, body only, cable, machine.',
              schema: { type: 'string' },
            },
            limitParam(EXERCISES_DEFAULT_LIMIT, EXERCISES_MAX_LIMIT),
          ],
          responses: {
            '200': {
              description: 'Matching exercises by name.',
              content: json({ type: 'object', properties: { exercises: { type: 'array', items: ref('Exercise') } } }),
            },
            ...errors,
          },
        },
      },
      '/workouts': {
        get: {
          operationId: 'listWorkouts',
          summary: 'Workouts with their prescribed exercises',
          description: 'What the person plans to do: sets, target reps and weight, and rest per exercise.',
          responses: {
            '200': {
              description: 'Workouts that are not archived, by name.',
              content: json({ type: 'object', properties: { workouts: { type: 'array', items: ref('Workout') } } }),
            },
            '401': errors['401'],
          },
        },
        post: {
          operationId: 'createWorkout',
          summary: 'Create a workout',
          description: 'Put it on the week with PUT /programme/week.' + WRITE,
          requestBody: { required: true, content: json(ref('WorkoutInput')) },
          responses: { '201': { description: 'The new workout.', content: json(ref('Workout')) }, ...writeErrors },
        },
      },
      '/workouts/{id}': {
        get: {
          operationId: 'getWorkout',
          summary: 'One workout',
          parameters: [idParam],
          responses: {
            '200': { description: 'The workout.', content: json(ref('Workout')) },
            '401': errors['401'],
            '404': { description: 'No such workout.', content: json(ref('Error')) },
          },
        },
        put: {
          operationId: 'replaceWorkout',
          summary: 'Replace a workout',
          description:
            'Replaces the name, notes and the whole exercise list — send every exercise, not just the ' +
            'changed ones. Sessions already trained keep what was done.' +
            WRITE,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref('WorkoutInput')) },
          responses: {
            '200': { description: 'The workout as it now stands.', content: json(ref('Workout')) },
            ...writeErrors,
            '404': { description: 'No such workout.', content: json(ref('Error')) },
          },
        },
        delete: {
          operationId: 'deleteWorkout',
          summary: 'Delete a workout',
          description: 'Sessions already trained are kept. Ask the person first.' + WRITE,
          parameters: [idParam],
          responses: {
            '200': {
              description: 'Deleted.',
              content: json({ type: 'object', properties: { deleted: { type: 'string' } } }),
            },
            ...writeErrors,
            '404': { description: 'No such workout.', content: json(ref('Error')) },
          },
        },
      },
      '/history': {
        get: {
          operationId: 'listHistory',
          summary: 'Trained sessions with every logged set, newest first',
          description:
            'What the person actually lifted. Use from/to to look at a period, and limit to reach further back.',
          parameters: [
            dateParam('from', 'Earliest session date to include.'),
            dateParam('to', 'Latest session date to include.'),
            limitParam(HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT),
          ],
          responses: {
            '200': {
              description: 'Sessions.',
              content: json({ type: 'object', properties: { sessions: { type: 'array', items: ref('Session') } } }),
            },
            ...errors,
          },
        },
      },
      '/bodyweight': {
        get: {
          operationId: 'listBodyweight',
          summary: 'Bodyweight measurements, newest first',
          parameters: [
            dateParam('from', 'Earliest measurement date to include.'),
            dateParam('to', 'Latest measurement date to include.'),
          ],
          responses: {
            '200': {
              description: 'At most one measurement per day.',
              content: json({ type: 'object', properties: { bodyweight: { type: 'array', items: ref('Bodyweight') } } }),
            },
            ...errors,
          },
        },
        put: {
          operationId: 'recordBodyweight',
          summary: "Record a day's bodyweight",
          description: 'One measurement per day: sending a date again corrects it.' + WRITE,
          requestBody: {
            required: true,
            content: json({
              type: 'object',
              required: ['date', 'weightKg'],
              properties: {
                date: { type: 'string', format: 'date' },
                weightKg: { type: 'number', minimum: 20, maximum: 400 },
                notes: { ...nullable('string'), maxLength: 500 },
              },
            }),
          },
          responses: { '200': { description: 'The measurement.', content: json(ref('Bodyweight')) }, ...writeErrors },
        },
      },
    },
  }
}
