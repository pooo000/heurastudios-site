---
title: "What teams train in Heura Studios"
description: "Eight jobs a team can train on Heura Arche without a machine learning specialist, from SQL and code review to contracts and runbooks: the script, the data and tests each one starts with, and where the model runs."
author: William
---

Heura Studios trains your own version of a base model, Heura Arche, on your team’s examples, without a machine learning specialist. This post is about what to train it for.

Arche has 2 billion parameters, so it does best at narrow work a team repeats every day, where a right answer can be written down and checked. Most teams have a few jobs like that. Here are eight, each with a few lines of its script, the data and tests it starts with, and where it runs.

## How every job is set up

Each model is a notebook in the Studio: the script in the middle, data and tests beside it, the run’s log underneath. Every job below takes the same five steps.

1. **Write the script.** A model’s script.md says who it is and how it works, in plain sentences. The editor marks each line as you type: who it is, its voice, a rule or a fact.
2. **Add data.** Files it answers from (PDF, Word, Markdown, text, CSV or HTML), examples of questions with the answers you want, and fixes you make in chat. Examples import from a two-column CSV, up to 1,000 rows at a time. The Datasets tab has 100 ready-made sets, all written by people.
3. **Write tests.** A test is a question and what a right answer must say, or must not. Train needs at least one.
4. **Train.** Each run makes a new version, a LoRA adapter on Heura Arche, and scores it on the tests before and after. A version that breaks more tests than it fixes doesn’t go live.
5. **Use it.** Chat with it in the Studio, call it through an OpenAI-compatible API, or download it to run on your own machine: the LoRA alone, or with a runtime that serves it locally.

Teammates can add data, chat and train. The owner keeps the tests, the downloads and the choice of which version is live.

## 1. Data team: plain questions to SQL

The same kinds of questions reach the analytics team every week from people who don’t write SQL. A model can write the query and leave the arithmetic to the database, which suits a small model better than adding up a table itself.

> Your name is Query.
>
> You always answer with one SQL query first, then one line on what it does.
>
> You always use the table and column names you were given, and never invent one.
>
> You never write a query that deletes or changes data unless someone asks for exactly that.
>
> Our warehouse runs PostgreSQL.

- **Data:** the schema as a file, and past questions with the query an analyst wrote. To start: *Write SQL from plain English*, 1,000 examples from the Spider text-to-SQL dataset.
- **Tests:** questions whose query must name the right tables and columns, and must not contain DELETE or UPDATE.
- **In use:** an internal tool sends each question to the API and shows the query, which runs under a read-only database role.

## 2. Engineering: first-pass code review

Much of a first review is the team’s own rules: how errors are handled, what never gets logged. A model trained on the team’s past reviews can leave the first comment before a person opens the pull request.

> Your name is Lint.
>
> You always lead with the bug that would hurt the most, then the rest in order.
>
> If the code is fine, say so in one line.
>
> We never log a customer’s email address.

- **Data:** past review comments with the diffs they were left on, and the style guide as a file. The Datasets tab’s 24 coding sets cover Python, TypeScript, Java, Go, Rust and more.
- **Tests:** diffs with a known bug the review must name, and a clean diff, which must get one line saying so.
- **In use:** CI sends each pull request’s diff to the API and posts the answer as a comment. A person still approves the merge. Engineers in Claude Code or Cursor can also drive the Studio over MCP with an agent key.

## 3. Operations: notes to action items

After most meetings, someone turns the notes into who does what by when. It’s a short job, done many times a week, and anyone who was there can check the answer.

> Your name is Minutes.
>
> You always list each action item as owner, task and due date.
>
> You always write “no owner” or “no date” instead of guessing one.
>
> You never add a task that isn’t in the notes.

- **Data:** a month of the team’s notes, each with the action list someone wrote from it. *Summarize a passage* and *Project management* add general practice.
- **Tests:** notes whose owners and dates the answer must contain, and notes without a date, which must get “no date”.
- **In use:** paste notes into the Studio’s chat, or have the notes tool send each new page to the API.

## 4. Support teams: sorting requests

Before anyone answers a request, someone reads it and decides where it goes. A model can do that first read for every ticket, email or form, with one label from your list and a priority. It doesn’t write to anyone.

> Your name is Triage.
>
> You answer with one category from our list and a priority from 1 to 3, nothing else.
>
> Our categories are billing, bug, access, feature request and other.
>
> A request that mentions a security problem is always priority 1.

- **Data:** a few hundred past requests with the labels your team gave them, imported as a CSV. To start: *Identify customer-support requests*, 1,000 opening messages from ASAPP’s ABCD support chats.
- **Tests:** requests with a known label and priority, including the ones your team argues about.
- **In use:** the helpdesk sends each new request to the API and files it under the label it gets back.

## 5. Legal: a first pass on contracts

Most contracts a company signs are close to its own templates. Legal needs to find where one isn’t: an auto-renewal, an uncapped liability, a governing law it doesn’t accept. A model trained on the team’s playbook can flag those clauses before a lawyer reads the rest.

> Your name is Clause.
>
> You flag clauses. You never approve one.
>
> You always quote the clause and name the playbook rule it breaks.
>
> We don’t accept auto-renewal terms longer than 12 months.

- **Data:** the playbook and templates as files, and past clauses with the flags the team gave them. Three ready-made sets fit: *Find clauses in contracts* (the Atticus Project’s lawyer-labeled CUAD contracts), *Identify contract clause types* (LEDGAR) and *Identify unfair terms of service* (UNFAIR-ToS).
- **Tests:** clauses that must be flagged under the right rule, and standard ones that must pass.
- **In use:** training happens in the Studio, then the model runs on your own machine, so the contracts you check with it stay there. Send it a section at a time. A lawyer makes every call.

## 6. Hardware: answers from standards

An engineering team’s standards live in long PDFs: tolerances, approved materials, CAD conventions, board layout rules. New engineers ask the senior ones the same questions. A model can answer from the documents and name the section it used.

> Your name is Spec.
>
> You answer from our design standards and always name the document and section.
>
> You never give a tolerance, rating or material that isn’t in the standards.
>
> If the standards don’t cover it, say so.
>
> We model in SolidWorks, in metric units.

- **Data:** the standards as files (PDF and Word are read into sections), and questions engineers have asked, with a senior engineer’s answers. *CAD modeling* (SolidWorks, Fusion 360, AutoCAD, FreeCAD and more), *PCB design & layout* and *Mechanical & civil engineering* add general practice.
- **Tests:** questions answered in a known section, which the answer must name, and one the standards don’t cover.
- **In use:** the team asks it in the Studio’s chat or through an internal tool. Anything safety-critical still goes to an engineer.

## 7. IT: the first step from the runbook

At 3 a.m., the on-call engineer needs the first step, not the whole runbook. A model trained on the runbooks can give it, and what it must never suggest can be tested before it ships.

> Your name is Pager.
>
> You always give the first step first, then the next two.
>
> You always name the runbook and the step number.
>
> You never suggest restarting the primary database.

- **Data:** the runbooks and incident write-ups as files, and alerts with the step that fixed them. *Servers & system administration* and *Linux & Unix command line* add general practice.
- **Tests:** alerts with a known first step, and answers that must not mention restarting the primary.
- **In use:** download the runtime and run it on your own servers. The alerting tool calls its OpenAI-compatible endpoint, and nothing reaches Heura Studios.

## 8. Product: one skill in your product

Some products need one AI skill, used thousands of times a day: pull the fields out of an email, label a document, summarize a note in the product’s format. A large general model behind someone else’s API is more than that needs, and you don’t decide when it changes. OpenAI’s self-serve fine-tuning, for one, stops taking new training jobs from its active customers on [January 6, 2027](https://developers.openai.com/api/docs/deprecations). A trained small model does the one job, and its file runs without us.

> Your name is Parse.
>
> You answer with JSON only, with the fields name, company, email and request.
>
> You leave a field empty instead of guessing it.

- **Data:** a few hundred real inputs, each with the exact output your product expects. *Identify people, places & organizations* (Few-NERD) adds practice at finding names.
- **Tests:** inputs whose JSON must hold the right values, and inputs missing a field, which must leave it empty.
- **In use:** download the LoRA. The zip holds the adapter, the system prompt it was trained with, a model card with its test results and the code to load it with transformers and PEFT, and its Apache 2.0 license. Serve it next to the rest of your product.

## What fits, and what doesn’t

Arche’s size is what lets it run on your own machine, and it also sets the limits. It does best at work like the eight jobs above: a narrow task with a fixed format, repeated often, with an answer that can be written down. It isn’t the right model for open-ended reasoning, long calculations, inputs too long to send at once (a whole codebase, a 200-page contract) or decisions nobody reviews.

The tests tell you which side of that line a job is on. Write them first, from the questions your team actually gets. They show, version by version, whether the model is getting the job right. A ready-made set adds general practice, but only your team’s examples carry your rules.

## Request access

Access to Heura Studios is by request. [Request access](/#request) and tell us the job you’d train first.
