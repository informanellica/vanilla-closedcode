/** @file HttpApi route definitions for the question group: list, reply to, and reject pending AI question requests. */
import { Question } from "#question/index.js";
import { QuestionID } from "#question/schema.js";
import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { Authorization } from "../middleware/authorization.js";
import { InstanceContextMiddleware } from "../middleware/instance-context.js";
import { WorkspaceRoutingMiddleware } from "../middleware/workspace-routing.js";
import { described } from "./metadata.js";
/** Base URL path prefix for all question endpoints. */
const root = "/question";
/** Request body schema for replying to a question: an array of user answers, one per question, in order. */
const ReplyPayload = Schema.Struct({
  answers: Schema.Array(Question.Answer).annotate({
    description: "User answers in order of questions (each answer is an array of selected labels)"
  })
});
/**
 * HttpApi surface for the question group, exposing endpoints to list pending
 * question requests and to reply to or reject a specific request.
 * The group is guarded by instance-context, workspace-routing, and authorization middleware.
 */
export const QuestionApi = HttpApi.make("question").add(HttpApiGroup.make("question").add(HttpApiEndpoint.get("list", root, {
  success: described(Schema.Array(Question.Request), "List of pending questions")
}).annotateMerge(OpenApi.annotations({
  identifier: "question.list",
  summary: "List pending questions",
  description: "Get all pending question requests across all sessions."
})), HttpApiEndpoint.post("reply", `${root}/:requestID/reply`, {
  params: {
    requestID: QuestionID
  },
  payload: ReplyPayload,
  success: described(Schema.Boolean, "Question answered successfully"),
  error: [HttpApiError.BadRequest, HttpApiError.NotFound]
}).annotateMerge(OpenApi.annotations({
  identifier: "question.reply",
  summary: "Reply to question request",
  description: "Provide answers to a question request from the AI assistant."
})), HttpApiEndpoint.post("reject", `${root}/:requestID/reject`, {
  params: {
    requestID: QuestionID
  },
  success: described(Schema.Boolean, "Question rejected successfully"),
  error: [HttpApiError.BadRequest, HttpApiError.NotFound]
}).annotateMerge(OpenApi.annotations({
  identifier: "question.reject",
  summary: "Reject question request",
  description: "Reject a question request from the AI assistant."
}))).annotateMerge(OpenApi.annotations({
  title: "question",
  description: "Question routes."
})).middleware(InstanceContextMiddleware).middleware(WorkspaceRoutingMiddleware).middleware(Authorization)).annotateMerge(OpenApi.annotations({
  title: "closedcode HttpApi",
  version: "0.0.1",
  description: "Effect HttpApi surface for instance routes."
}));