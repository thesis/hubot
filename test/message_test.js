/* global describe, beforeEach, it */
/* eslint-disable no-unused-expressions */

// Assertions and Stubbing
const chai = require("chai")
chai.use(require("sinon-chai"))

const { expect } = chai

// Hubot classes
const User = require("../src/user")
const { Message } = require("../src/message")
const { TextMessage } = require("../src/message")

describe("Message", () => {
  beforeEach(function () {
    this.user = new User({
      id: 1,
      name: "hubottester",
      room: "#mocha",
    })
  })

  describe("Unit Tests", () => {
    describe("#finish", () =>
      it("marks the message as done", function () {
        const testMessage = new Message(this.user)
        expect(testMessage.done).to.not.be.ok
        testMessage.finish()
        expect(testMessage.done).to.be.ok
      }))

    describe("TextMessage", () =>
      describe("#match", () =>
        it("should perform standard regex matching", function () {
          const testMessage = new TextMessage(this.user, "message123")
          expect(testMessage.match(/^message123$/)).to.be.ok
          expect(testMessage.match(/^does-not-match$/)).to.not.be.ok
        })))
  })
})
