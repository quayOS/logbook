/**
 * Utility module for creating loggers with a globally equal, customised format.
 * @module
 */

'use strict'

const cls = require('cls-hooked')
const fs = require('fs')
const uuid = require('uuid/v4')
const path = require('path')
const winston = require('winston')

const correlationStore = cls.createNamespace('b7278b8c-fd1f-4875-b63e-550b3ca34696')

/**
 * Create a logger for the given module. Prints JSON messages to the console,
 * adding information like the logging module's filename, a timestamp and a
 * correlation id if called from within {@link module:logbook.correlate}.
 *
 * @example
 * const log = require('logbook').logger(__filename)
 * log.info('Hello, world')
 * // Output (indented for better readability):
 * // {
 * //   "message": "Hello, world",
 * //   "level": "info",
 * //   "origin": "test.js",
 * //   "timestamp":"2018-08-12T17:08:45.339Z"
 * // }
 *
 * @param  {string} name The name to use for logging the message's origin. If this
 * is a path to a file (e.g. a module), only the part relative to the project's
 * root will be logged.
 * @return {winston.Logger} The pre-configured logger.
 */
module.exports.createLogger = function createLogger (name) {
  const origin = fs.existsSync(name)
    ? path.relative(
      path.dirname(
        require.main.filename ||
        (process.mainModule && process.mainModule.filename)
      ) || '',
      path.resolve(name)
    )
    : name

  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || (process.env.DEBUG ? 'silly' : 'verbose'),
    format: winston.format.combine(
      // Add correlation id if available
      winston.format((info, opts) => {
        const correlationId = correlationStore.get('correlationId')
        if (correlationId) return Object.assign(info, { correlationId })
        return info
      })(),
      winston.format(info => Object.assign(info, { origin }))(),
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [new winston.transports.Console()]
  })

  return logger
}

/**
 * Call the given function and add a correlation id to all messages logged
 * during the function's execution unique to this correlate() call when using a
 * logger created through {@link module:logbook.createLogger}.
 *
 * @example
 * const logger = require('logbook')
 * const log = logger.createLogger(__filename)
 * logger.correlate(() => {
 *   log.info('Test 1')
 *   setTimeout(() => { log.info('Test 2') }, 1000)
 * })
 * log.info('Test 3')
 * // Output (indented for better readability):
 * // {
 * //   "message": "Test 1",
 * //   "level": "info",
 * //   "correlationId": "957b17ec-13f5-4e1e-9683-7a6fc8198f1c",
 * //   "origin": "test.js",
 * //   "timestamp": "2018-08-12T19:27:09.381Z"
 * // }
 * // {
 * //   "message": "Test 3",
 * //   "level": "info",
 * //   "origin": "test.js",
 * //   "timestamp": "2018-08-12T19:27:09.385Z"
 * // }
 * // ...after 1 second:
 * // {
 * //   "message": "Test 3",
 * //   "level": "info",
 * //   "correlationId": "957b17ec-13f5-4e1e-9683-7a6fc8198f1c",
 * //   "origin": "test.js",
 * //   "timestamp": "2018-08-12T19:27:10.386Z"
 * // }
 *
 * @param  {Function} fn The function to call.
 * @return {Any} Return value of the given function, if any.
 */
module.exports.correlate = function correlate (fn) {
  return correlationStore.runAndReturn(() => {
    correlationStore.set('correlationId', uuid())
    return fn()
  })
}
