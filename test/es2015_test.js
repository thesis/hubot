/* global describe, it */
/* eslint-disable no-unused-expressions */

// Assertions and Stubbing
const chai = require("chai")
const sinon = require("sinon")
chai.use(require("sinon-chai"))
const mockery = require("mockery")

const { expect } = chai

// Hubot classes
const Hubot = require("../es2015")

const { User } = Hubot
const { Brain } = Hubot
const { Robot } = Hubot
const { Adapter } = Hubot
const { Response } = Hubot
const { Listener } = Hubot
const { TextListener } = Hubot
const { Message } = Hubot
const { TextMessage } = Hubot
const { EnterMessage } = Hubot
const { LeaveMessage } = Hubot
const { TopicMessage } = Hubot
const { CatchAllMessage } = Hubot
const { loadBot } = Hubot

describe("hubot/es2015", () => {
  it("exports User class", () => {
    class MyUser extends User {}
    const user = new MyUser("id123", { foo: "bar" })

    expect(user).to.be.an.instanceof(User)
    expect(user.id).to.equal("id123")
    expect(user.foo).to.equal("bar")
  })

  it("exports Brain class", () => {
    class MyBrain extends Brain {}
    const robotMock = {
      on: sinon.spy(),
    }
    const brain = new MyBrain(robotMock)

    expect(brain).to.be.an.instanceof(Brain)
    expect(robotMock.on).to.have.been.called

    brain.set("foo", "bar")
    expect(brain.get("foo")).to.equal("bar")
  })

  it("exports Robot class", () => {
    mockery.enable({
      warnOnReplace: false,
      warnOnUnregistered: false,
    })
    mockery.registerMock(
      "hubot-mock-adapter",
      require("./fixtures/mock-adapter")
    )

    class MyRobot extends Robot {}
    const robot = new MyRobot(null, "mock-adapter", false, "TestHubot")

    expect(robot).to.be.an.instanceof(Robot)
    expect(robot.name).to.equal("TestHubot")

    mockery.disable()
  })

  it("exports Adapter class", () => {
    class MyAdapter extends Adapter {}
    const adapter = new MyAdapter("myrobot")

    expect(adapter).to.be.an.instanceof(Adapter)
    expect(adapter.robot).to.equal("myrobot")
  })

  it("exports Response class", () => {
    class MyResponse extends Response {}
    const robotMock = "robotMock"
    const messageMock = {
      room: "room",
      user: "user",
    }
    const matchMock = "matchMock"
    const response = new MyResponse(robotMock, messageMock, matchMock)

    expect(response).to.be.an.instanceof(Response)
    expect(response.message).to.equal(messageMock)
    expect(response.match).to.equal(matchMock)
  })

  it("exports Listener class", () => {
    class MyListener extends Listener {}
    const robotMock = "robotMock"
    const matcherMock = "matchMock"
    const callback = sinon.spy()
    const listener = new MyListener(robotMock, matcherMock, callback)

    expect(listener).to.be.an.instanceof(Listener)
    expect(listener.robot).to.equal(robotMock)
    expect(listener.matcher).to.equal(matcherMock)
    expect(listener.options).to.deep.include({
      id: null,
    })
    expect(listener.callback).to.equal(callback)
  })

  it("exports TextListener class", () => {
    class MyTextListener extends TextListener {}
    const robotMock = "robotMock"
    const regex = /regex/
    const callback = sinon.spy()
    const textListener = new MyTextListener(robotMock, regex, callback)

    expect(textListener).to.be.an.instanceof(TextListener)
    expect(textListener.regex).to.equal(regex)
  })

  it("exports Message class", () => {
    class MyMessage extends Message {}
    const userMock = {
      room: "room",
    }
    const message = new MyMessage(userMock)

    expect(message).to.be.an.instanceof(Message)
    expect(message.user).to.equal(userMock)
  })

  it("exports TextMessage class", () => {
    class MyTextMessage extends TextMessage {}
    const userMock = {
      room: "room",
    }
    const textMessage = new MyTextMessage(userMock, "bla blah")

    expect(textMessage).to.be.an.instanceof(TextMessage)
    expect(textMessage).to.be.an.instanceof(Message)
    expect(textMessage.text).to.equal("bla blah")
  })

  it("exports EnterMessage class", () => {
    class MyEnterMessage extends EnterMessage {}
    const userMock = {
      room: "room",
    }
    const enterMessage = new MyEnterMessage(userMock)

    expect(enterMessage).to.be.an.instanceof(EnterMessage)
    expect(enterMessage).to.be.an.instanceof(Message)
  })

  it("exports LeaveMessage class", () => {
    class MyLeaveMessage extends LeaveMessage {}
    const userMock = {
      room: "room",
    }
    const leaveMessage = new MyLeaveMessage(userMock)

    expect(leaveMessage).to.be.an.instanceof(LeaveMessage)
    expect(leaveMessage).to.be.an.instanceof(Message)
  })

  it("exports TopicMessage class", () => {
    class MyTopicMessage extends TopicMessage {}
    const userMock = {
      room: "room",
    }
    const topicMessage = new MyTopicMessage(userMock)

    expect(topicMessage).to.be.an.instanceof(TopicMessage)
    expect(topicMessage).to.be.an.instanceof(Message)
  })

  it("exports CatchAllMessage class", () => {
    class MyCatchAllMessage extends CatchAllMessage {}
    const messageMock = {
      user: {
        room: "room",
      },
    }
    const catchAllMessage = new MyCatchAllMessage(messageMock)

    expect(catchAllMessage).to.be.an.instanceof(CatchAllMessage)
    expect(catchAllMessage).to.be.an.instanceof(Message)
    expect(catchAllMessage.message).to.equal(messageMock)
    expect(catchAllMessage.user).to.equal(messageMock.user)
  })

  it("exports loadBot function", () => {
    sinon.stub(Hubot, "Robot")

    expect(loadBot).to.be.a("function")
    Hubot.loadBot(
      "adapterPath",
      "adapterName",
      "enableHttpd",
      "botName",
      "botAlias"
    )
    expect(Hubot.Robot).to.be.called.calledWith(
      "adapterPath",
      "adapterName",
      "enableHttpd",
      "botName",
      "botAlias"
    )
  })
})
