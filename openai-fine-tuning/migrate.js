// The OpenAI migration page's converter (openai-fine-tuning/index.html): an OpenAI fine-tuning file (JSONL) in, the
// Studio's question,answer CSV out, all in the browser (nothing is uploaded; there's no fetch in here). The formats:
//   chat        {"messages": [{role, content}, ...]}: each assistant reply (not "weight": 0, not a tool call) is a row,
//               with the user message just before it as the question; system messages are counted, and the most
//               common one is offered as the agent's script
//   preference  {"input": {"messages": [...]}, "preferred_output": [{role: "assistant", content}], ...}: the preferred
//               answer, after the input's last user message
//   legacy      {"prompt": "...", "completion": "..."}
// content may be a string or a list of parts ({type: "text", text}); other parts (images, audio) are left out.
// The Studio's limits (studio/projects.py): questions up to 2,000 characters, answers up to 4,000, 1,000 rows an
// import (so the CSV comes in parts of 1,000), 5,000 an agent.
(function () {
  'use strict';
  var Q_MAX = 2000, A_MAX = 4000, PART = 1000, AGENT_MAX = 5000, FILE_MAX = 200 * 1024 * 1024;

  function textOf(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map(function (p) {
        if (typeof p === 'string') return p;
        return p && (p.type === 'text' || p.type === 'input_text' || p.type === 'output_text') && typeof p.text === 'string' ? p.text : '';
      }).filter(Boolean).join('\n');
    }
    return '';
  }

  // one line of the file -> {pairs: [[q, a]], systems: [text], skipped: {reason: n}, turns: user messages}
  function readLine(obj) {
    var out = { pairs: [], systems: [], skipped: {}, turns: 0 };
    function skip(why) { out.skipped[why] = (out.skipped[why] || 0) + 1; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { skip('shape'); return out; }
    if (typeof obj.prompt === 'string' && typeof obj.completion === 'string') {
      out.pairs.push([obj.prompt, obj.completion]);
      out.turns = 1;
      return out;
    }
    var messages = null;
    if (Array.isArray(obj.messages)) messages = obj.messages;
    else if (obj.input && Array.isArray(obj.input.messages) && Array.isArray(obj.preferred_output)) {
      messages = obj.input.messages.concat(obj.preferred_output);
    }
    if (!messages) { skip('shape'); return out; }
    var question = null, any = false;
    messages.forEach(function (m) {
      if (!m || typeof m !== 'object') return;
      var text = textOf(m.content).trim();
      if (m.role === 'system' || m.role === 'developer') { if (text) out.systems.push(text); return; }
      if (m.role === 'user') { question = text || null; out.turns += 1; return; }
      if (m.role !== 'assistant') return;   // tool results and the old function role
      if (m.weight === 0) { skip('weight'); return; }
      if (!text) { skip(m.tool_calls || m.function_call ? 'tool' : 'empty'); return; }
      if (!question) { skip('noquestion'); return; }
      out.pairs.push([question, text]);
      any = true;
    });
    if (!any && !out.pairs.length && !Object.keys(out.skipped).length) skip('noanswer');
    return out;
  }

  // the whole file -> {lines, rows: [[q, a]], skipped: {reason: n}, bad: lines that aren't JSON, systems: [[text, n]],
  //                    multi: rows from conversations with more than one question}
  function convert(text) {
    var res = { lines: 0, rows: [], skipped: {}, bad: 0, systems: [], multi: 0 };
    var counts = new Map();
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      res.lines += 1;
      var obj;
      try { obj = JSON.parse(line); } catch (e) { res.bad += 1; return; }
      var got = readLine(obj);
      Object.keys(got.skipped).forEach(function (k) { res.skipped[k] = (res.skipped[k] || 0) + got.skipped[k]; });
      got.systems.forEach(function (s) { counts.set(s, (counts.get(s) || 0) + 1); });
      got.pairs.forEach(function (p) {
        var q = String(p[0]).replace(/\r\n?/g, '\n').trim(), a = String(p[1]).replace(/\r\n?/g, '\n').trim();   // (line breaks as the Studio stores them)
        if (!q || !a) { res.skipped.empty = (res.skipped.empty || 0) + 1; return; }
        if (q.length > Q_MAX || a.length > A_MAX) { res.skipped.long = (res.skipped.long || 0) + 1; return; }
        res.rows.push([q, a]);
        if (got.turns > 1) res.multi += 1;
      });
    });
    res.systems = Array.from(counts.entries()).sort(function (x, y) { return y[1] - x[1]; });
    return res;
  }

  function cell(s) { return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCsv(rows) {
    return 'question,answer\r\n' + rows.map(function (r) { return cell(r[0]) + ',' + cell(r[1]); }).join('\r\n') + '\r\n';
  }

  var n = function (x) { return x.toLocaleString('en-US'); };
  var plural = function (x, one, many) { return n(x) + ' ' + (x === 1 ? one : (many || one + 's')); };
  var WHY = {
    bad: function (x) { return plural(x, 'line') + ' that ' + (x === 1 ? 'isn’t' : 'aren’t') + ' JSON'; },
    shape: function (x) { return plural(x, 'line') + ' in a format the converter doesn’t know'; },
    weight: function (x) { return plural(x, 'reply', 'replies') + ' marked "weight": 0'; },
    tool: function (x) { return plural(x, 'tool call') + ' (the Studio trains on text)'; },
    empty: function (x) { return plural(x, 'reply', 'replies') + ' with no text'; },
    noquestion: function (x) { return plural(x, 'reply', 'replies') + ' with no question before ' + (x === 1 ? 'it' : 'them'); },
    noanswer: function (x) { return plural(x, 'line') + ' with no answer to train on'; },
    long: function (x) { return plural(x, 'row') + ' over the Studio’s limits (questions up to 2,000 characters, answers up to 4,000)'; },
  };

  var SAMPLE = [
    { messages: [{ role: 'system', content: 'You are Pip, the support agent for Northwind Bikes. Answer in two sentences or fewer.' },
      { role: 'user', content: 'How long does shipping take?' },
      { role: 'assistant', content: 'Orders ship in 1 to 2 business days and arrive within a week in Canada and the US.' }] },
    { messages: [{ role: 'system', content: 'You are Pip, the support agent for Northwind Bikes. Answer in two sentences or fewer.' },
      { role: 'user', content: 'Can I return a helmet?' },
      { role: 'assistant', content: 'Yes, within 30 days if it’s unused and in its box.' },
      { role: 'user', content: 'And if I already wore it once?' },
      { role: 'assistant', content: 'A worn helmet can’t be returned, for safety reasons, but we can exchange its size.' }] },
    { messages: [{ role: 'system', content: 'You are Pip, the support agent for Northwind Bikes. Answer in two sentences or fewer.' },
      { role: 'user', content: 'Where is order 4417?' },
      { role: 'assistant', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'track_order', arguments: '{"order":"4417"}' } }] }] },
    { input: { messages: [{ role: 'user', content: 'Do you sell e-bikes?' }] },
      preferred_output: [{ role: 'assistant', content: 'Yes: the Northwind Volt comes in two frame sizes.' }],
      non_preferred_output: [{ role: 'assistant', content: 'No.' }] },
    { prompt: 'What are your store hours?', completion: 'We’re open 10 to 6, Tuesday to Sunday.' },
  ].map(function (o) { return JSON.stringify(o); }).join('\n') + '\n';

  // ---- the page
  var tool = document.querySelector('[data-tool]');
  if (!tool) return;
  tool.hidden = false;
  var input = document.getElementById('mg-file'), drop = tool.querySelector('[data-drop]');
  var error = tool.querySelector('[data-error]'), result = tool.querySelector('[data-result]');
  var urls = [];

  function show(res, name) {
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    urls = [];
    error.textContent = '';
    var skippedTotal = res.bad + Object.keys(res.skipped).reduce(function (a, k) { return a + res.skipped[k]; }, 0);
    if (!res.rows.length) {
      result.hidden = true;
      error.textContent = res.lines
        ? 'No rows to import in ' + name + '. ' + describeSkips(res).join('; ') + '.'
        : name + ' is empty.';
      return;
    }
    result.querySelector('[data-result-title]').textContent = name;
    var counts = result.querySelector('[data-counts]');
    counts.replaceChildren(stat('Rows for the Studio', n(res.rows.length)), stat('Lines read', n(res.lines)),
      stat('Left out', n(skippedTotal)));

    var notes = [];
    if (skippedTotal) notes.push('Left out: ' + describeSkips(res).join('; ') + '.');
    if (res.multi) notes.push(plural(res.multi, 'row') + ' came from conversations with several turns: each is the reply with the question just before it.');
    if (res.rows.length > AGENT_MAX) notes.push('An agent holds up to ' + n(AGENT_MAX) + ' examples. Import the parts you need most, or split them across agents.');
    result.querySelector('[data-notes]').replaceChildren.apply(result.querySelector('[data-notes]'),
      notes.map(function (t) { var li = document.createElement('li'); li.textContent = t; return li; }));

    var downloads = result.querySelector('[data-downloads]');
    var parts = Math.ceil(res.rows.length / PART), base = name.replace(/\.[^.]+$/, '') || 'examples', links = [];
    for (var i = 0; i < parts; i++) {
      var rows = res.rows.slice(i * PART, (i + 1) * PART);
      var url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
      urls.push(url);
      var a = document.createElement('a');
      a.className = 'ov-btn ' + (i === 0 ? 'ov-btn-primary' : 'ov-btn-quiet');
      a.href = url;
      a.download = base + (parts > 1 ? '-part-' + (i + 1) + '-of-' + parts : '') + '.csv';
      a.textContent = parts > 1 ? 'Download part ' + (i + 1) + ' of ' + parts + ' (' + plural(rows.length, 'row') + ')'
        : 'Download the CSV (' + plural(rows.length, 'row') + ')';
      links.push(a);
    }
    downloads.replaceChildren.apply(downloads, links);

    var script = result.querySelector('[data-script]');
    script.hidden = !res.systems.length;
    if (res.systems.length) {
      result.querySelector('[data-script-text]').value = res.systems[0][0];
      result.querySelector('[data-script-note]').textContent = res.systems.length > 1
        ? 'Your file has ' + plural(res.systems.length, 'different system message') + '. This one is the most common (' + plural(res.systems[0][1], 'line') + '). Paste it into the agent’s script.md.'
        : 'Your system message, from ' + plural(res.systems[0][1], 'line') + '. Paste it into the agent’s script.md.';
    }

    var tbody = result.querySelector('[data-rows]');
    tbody.replaceChildren.apply(tbody, res.rows.slice(0, 3).map(function (r) {
      var tr = document.createElement('tr');
      r.forEach(function (t) { var td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
      return tr;
    }));
    result.querySelector('[data-preview]').hidden = false;
    result.hidden = false;
    result.focus({ preventScroll: false });
  }

  function describeSkips(res) {
    var out = [];
    if (res.bad) out.push(WHY.bad(res.bad));
    Object.keys(WHY).forEach(function (k) { if (k !== 'bad' && res.skipped[k]) out.push(WHY[k](res.skipped[k])); });
    return out;
  }

  function stat(label, value) {
    var div = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = value;
    div.append(dt, dd);
    return div;
  }

  function read(file) {
    if (!file) return;
    if (file.size > FILE_MAX) {
      result.hidden = true;
      error.textContent = file.name + ' is larger than 200 MB. Split it and convert each part.';
      return;
    }
    file.text().then(function (t) { show(convert(t.replace(/^﻿/, '')), file.name); }, function () {
      result.hidden = true;
      error.textContent = 'Your browser couldn’t read ' + file.name + '.';
    });
  }

  input.addEventListener('change', function () { read(input.files[0]); input.value = ''; });
  tool.querySelector('[data-sample]').addEventListener('click', function () { show(convert(SAMPLE), 'sample.jsonl'); });
  ['dragenter', 'dragover'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    drop.addEventListener(t, function () { drop.classList.remove('is-over'); });
  });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    read(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  tool.querySelector('[data-copy]').addEventListener('click', function (e) {
    var text = result.querySelector('[data-script-text]'), btn = e.currentTarget;
    var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text.value).then(done, function () { text.select(); });
    else { text.select(); }
  });

  // the days left before OpenAI's cutoff, while there are some
  document.querySelectorAll('[data-until]').forEach(function (el) {
    var end = new Date(el.getAttribute('data-until') + 'T00:00:00'), days = Math.ceil((end - new Date()) / 864e5);
    if (days > 0) { el.textContent = plural(days, 'day') + ' left.'; el.hidden = false; }
  });

  window.HeuraMigrate = { convert: convert, toCsv: toCsv };   // (for the tests)
})();
