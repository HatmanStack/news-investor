#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6"]
# ///
"""Check that every CloudWatch alarm in a SAM template can actually fire.

A misconfigured alarm is indistinguishable from a working one by inspection:
it appears in the template, it appears in the console, and it sits in
INSUFFICIENT_DATA forever. The ways that happens here are

  1. the metric name is not a metric AWS publishes,
  2. the dimension set names a resource, or a combination of dimensions, the
     stack does not produce,
  3. the comparison and threshold cannot be crossed by the metric's range, or
  4. the evaluation window is shorter than the metric's own quiet period, so
     the alarm either never fires or fires continuously.

(1) is the quietest of the four: CloudFormation accepts any string as a
MetricName, so `Duratoin` deploys cleanly and never produces a datapoint.

This script decides each of those mechanically. It is deliberately strict
about (4) in both directions: a low-watermark Invocations alarm must span more
than its function's longest legitimate schedule gap, and a scheduled function
without such an alarm must have a gap that genuinely cannot be expressed
within CloudWatch's one-day maximum evaluation window. That second rule is
what stops "we could not express it" from quietly becoming "we forgot".

Known limits — things this script does NOT decide, so a reader does not assume
coverage that is not here:

  - An unreachably high threshold is only caught where a ceiling can be
    derived from the template: a Lambda Duration against that function's
    Timeout, an API Gateway count against the stage's throttle rate, and a
    scheduled function's invocation-derived counts against its own cadence.
    DynamoDB capacity on PAY_PER_REQUEST, SQS queue depth, and counts on
    request-driven Lambdas have no ceiling the template knows, so an absurd
    threshold on those passes.
  - Statistic is not checked for fitness. Sum over a gauge, or Maximum over a
    rate, is accepted.
  - Whether a metric is emitted at the requested resolution is checked only
    for API Gateway per-route dimensions, which require DetailedMetricsEnabled.
    No equivalent check exists for other namespaces.
  - Alarm actions are checked to name an SNS topic in the same template, not
    to have a confirmed subscriber. An unsubscribed topic notifies nobody, and
    that is invisible from here.

Usage:
    ./scripts/validate-alarms.py [template.yaml ...]
    uv run --script scripts/validate-alarms.py

The shebang runs it through `uv`, which the repo already requires for ruff and
mypy, so the PyYAML dependency installs itself. A bare `python3` works too if
PyYAML happens to be importable.

Exit codes:
    0 - every alarm is well-formed and reachable
    1 - at least one alarm could not fire, or a required alarm is missing
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from itertools import pairwise
from pathlib import Path

try:
    import yaml
except ModuleNotFoundError:  # pragma: no cover - environment guard
    sys.exit(
        "PyYAML is not importable. Run this through uv instead:\n"
        "    uv run --script scripts/validate-alarms.py"
    )

# CloudWatch: "An alarm's total current evaluation period can be no longer
# than one day, so Period multiplied by EvaluationPeriods cannot be more than
# 86,400 seconds."
MAX_EVALUATION_WINDOW_S = 86400


class MetricSpec:
    """What is known about one (namespace, metric) pair.

    Membership in KNOWN_METRICS is the load-bearing part: CloudFormation
    accepts any string as a MetricName, so an alarm on `Duratoin` or `5XX`
    deploys without complaint and never receives a datapoint. Being in this
    table is the assertion that AWS actually publishes the metric.
    """

    __slots__ = ("non_negative",)

    def __init__(self, non_negative: bool = True) -> None:
        # Whether the metric's value has a floor of zero. Every metric below
        # does today; the field exists so that adding one that does not — a
        # custom gauge, say — cannot silently inherit the range check.
        self.non_negative = non_negative


# Every (namespace, metric) pair these templates may legitimately alarm on.
# An alarm whose pair is absent is rejected: either the name is a typo, or the
# metric is real and this table needs extending, and both should be a
# deliberate edit rather than a silent pass.
KNOWN_METRICS: dict[tuple[str, str], MetricSpec] = {
    # https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics.html
    ("AWS/Lambda", "Invocations"): MetricSpec(),
    ("AWS/Lambda", "Errors"): MetricSpec(),
    ("AWS/Lambda", "Throttles"): MetricSpec(),
    ("AWS/Lambda", "Duration"): MetricSpec(),
    ("AWS/Lambda", "PostRuntimeExtensionsDuration"): MetricSpec(),
    ("AWS/Lambda", "ConcurrentExecutions"): MetricSpec(),
    ("AWS/Lambda", "UnreservedConcurrentExecutions"): MetricSpec(),
    ("AWS/Lambda", "IteratorAge"): MetricSpec(),
    ("AWS/Lambda", "DeadLetterErrors"): MetricSpec(),
    ("AWS/Lambda", "DestinationDeliveryFailures"): MetricSpec(),
    ("AWS/Lambda", "AsyncEventsReceived"): MetricSpec(),
    ("AWS/Lambda", "AsyncEventAge"): MetricSpec(),
    ("AWS/Lambda", "AsyncEventsDropped"): MetricSpec(),
    # https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-monitoring.html
    ("AWS/Events", "Invocations"): MetricSpec(),
    ("AWS/Events", "FailedInvocations"): MetricSpec(),
    ("AWS/Events", "TriggeredRules"): MetricSpec(),
    ("AWS/Events", "MatchedEvents"): MetricSpec(),
    ("AWS/Events", "ThrottledRules"): MetricSpec(),
    ("AWS/Events", "DeadLetterInvocations"): MetricSpec(),
    # https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-available-cloudwatch-metrics.html
    ("AWS/SQS", "ApproximateNumberOfMessagesVisible"): MetricSpec(),
    ("AWS/SQS", "ApproximateNumberOfMessagesNotVisible"): MetricSpec(),
    ("AWS/SQS", "ApproximateNumberOfMessagesDelayed"): MetricSpec(),
    ("AWS/SQS", "ApproximateAgeOfOldestMessage"): MetricSpec(),
    ("AWS/SQS", "NumberOfMessagesSent"): MetricSpec(),
    ("AWS/SQS", "NumberOfMessagesReceived"): MetricSpec(),
    ("AWS/SQS", "NumberOfMessagesDeleted"): MetricSpec(),
    ("AWS/SQS", "NumberOfEmptyReceives"): MetricSpec(),
    ("AWS/SQS", "SentMessageSize"): MetricSpec(),
    # https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/metrics-dimensions.html
    ("AWS/DynamoDB", "ConsumedReadCapacityUnits"): MetricSpec(),
    ("AWS/DynamoDB", "ConsumedWriteCapacityUnits"): MetricSpec(),
    ("AWS/DynamoDB", "ProvisionedReadCapacityUnits"): MetricSpec(),
    ("AWS/DynamoDB", "ProvisionedWriteCapacityUnits"): MetricSpec(),
    ("AWS/DynamoDB", "ReadThrottleEvents"): MetricSpec(),
    ("AWS/DynamoDB", "WriteThrottleEvents"): MetricSpec(),
    ("AWS/DynamoDB", "ThrottledRequests"): MetricSpec(),
    ("AWS/DynamoDB", "ConditionalCheckFailedRequests"): MetricSpec(),
    ("AWS/DynamoDB", "SuccessfulRequestLatency"): MetricSpec(),
    ("AWS/DynamoDB", "SystemErrors"): MetricSpec(),
    ("AWS/DynamoDB", "UserErrors"): MetricSpec(),
    ("AWS/DynamoDB", "ReturnedItemCount"): MetricSpec(),
    # https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-metrics.html
    # Note the case: HTTP APIs publish `4xx`/`5xx`, not the REST API's
    # `4XXError`/`5XXError`. `5XX` is not a metric and produces no data.
    ("AWS/ApiGateway", "4xx"): MetricSpec(),
    ("AWS/ApiGateway", "5xx"): MetricSpec(),
    ("AWS/ApiGateway", "Count"): MetricSpec(),
    ("AWS/ApiGateway", "Latency"): MetricSpec(),
    ("AWS/ApiGateway", "IntegrationLatency"): MetricSpec(),
    ("AWS/ApiGateway", "DataProcessed"): MetricSpec(),
}

# The dimension that identifies the emitting resource, per namespace, and the
# CloudFormation resource type it must resolve to.
IDENTITY_DIMENSION = {
    "AWS/Lambda": (
        "FunctionName",
        {"AWS::Serverless::Function", "AWS::Lambda::Function"},
    ),
    "AWS/Events": ("RuleName", {"AWS::Events::Rule"}),
    "AWS/SQS": ("QueueName", {"AWS::SQS::Queue"}),
    "AWS/DynamoDB": ("TableName", {"AWS::DynamoDB::Table"}),
    "AWS/ApiGateway": ("ApiId", {"AWS::ApiGatewayV2::Api", "AWS::Serverless::HttpApi"}),
}

# The dimension *combinations* each namespace actually publishes. CloudWatch
# does not aggregate across dimensions: a metric is retrievable only at the
# combinations it was published under, so an alarm naming a set AWS never
# emits is as dead as one naming a nonexistent resource. Frozensets because
# order is irrelevant.
VALID_DIMENSION_SETS: dict[str, list[frozenset[str]]] = {
    "AWS/Lambda": [
        frozenset({"FunctionName"}),
        frozenset({"FunctionName", "Resource"}),
        frozenset({"FunctionName", "Resource", "ExecutedVersion"}),
    ],
    "AWS/Events": [frozenset({"RuleName"})],
    "AWS/SQS": [frozenset({"QueueName"})],
    "AWS/DynamoDB": [
        frozenset({"TableName"}),
        frozenset({"TableName", "Operation"}),
        frozenset({"TableName", "GlobalSecondaryIndexName"}),
        frozenset({"TableName", "StreamLabel"}),
        frozenset({"TableName", "ReceivingRegion"}),
    ],
    "AWS/ApiGateway": [
        # HTTP API stage-level, published for free.
        frozenset({"ApiId", "Stage"}),
        # HTTP API per-route, published only with DetailedMetricsEnabled.
        frozenset({"ApiId", "Stage", "Method", "Resource"}),
        frozenset({"ApiId", "Stage", "Route"}),
    ],
}

# The per-route dimension set is only populated when detailed metrics are on
# for that route; without them the alarm sits in INSUFFICIENT_DATA.
API_PER_ROUTE_DIMENSIONS = frozenset({"ApiId", "Stage", "Method", "Resource"})


# ── CloudFormation-aware YAML loading ────────────────────────────────────────


class Intrinsic:
    """A `!Ref`-style short-form tag, kept as data rather than resolved."""

    def __init__(self, tag: str, value: object) -> None:
        self.tag = tag
        self.value = value

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"{self.tag}({self.value!r})"


class CfnLoader(yaml.SafeLoader):
    pass


def _intrinsic(loader: yaml.Loader, tag_suffix: str, node: yaml.Node) -> Intrinsic:
    if isinstance(node, yaml.ScalarNode):
        value: object = loader.construct_scalar(node)
    elif isinstance(node, yaml.SequenceNode):
        value = loader.construct_sequence(node, deep=True)
    else:
        value = loader.construct_mapping(node, deep=True)
    return Intrinsic(tag_suffix, value)


CfnLoader.add_multi_constructor("!", _intrinsic)


def load_template(path: Path) -> dict:
    with path.open() as handle:
        return yaml.load(handle, Loader=CfnLoader)


# ── Schedule arithmetic ──────────────────────────────────────────────────────

_DOW_NAMES = {"SUN": 1, "MON": 2, "TUE": 3, "WED": 4, "THU": 5, "FRI": 6, "SAT": 7}
_MONTH_NAMES = {
    name: index + 1
    for index, name in enumerate(
        [
            "JAN",
            "FEB",
            "MAR",
            "APR",
            "MAY",
            "JUN",
            "JUL",
            "AUG",
            "SEP",
            "OCT",
            "NOV",
            "DEC",
        ]
    )
}


def _expand_field(
    spec: str, low: int, high: int, names: dict[str, int]
) -> set[int] | None:
    """Expand one cron field to the set of values it matches, or None for any."""
    spec = spec.strip().upper()
    if spec in ("*", "?"):
        return None
    out: set[int] = set()
    for part in spec.split(","):
        step = 1
        if "/" in part:
            part, step_text = part.split("/", 1)
            step = int(step_text)
            if part in ("*", "?"):
                part = f"{low}-{high}"
        if "-" in part[1:] or (part.startswith("-") is False and "-" in part):
            start_text, end_text = part.split("-", 1)
            start = names.get(start_text, None)
            end = names.get(end_text, None)
            start = int(start_text) if start is None else start
            end = int(end_text) if end is None else end
        else:
            value = names.get(part, None)
            start = end = int(part) if value is None else value
        out.update(range(start, end + 1, step))
    return out


def cron_fire_times(expression: str, start: datetime, weeks: int) -> list[datetime]:
    """Every minute in [start, start + weeks) at which an AWS cron expression fires."""
    fields = expression.strip().split()
    if len(fields) != 6:
        raise ValueError(f"AWS cron takes 6 fields, got {len(fields)}: {expression!r}")
    minute, hour, dom, month, dow, _year = fields

    minutes = _expand_field(minute, 0, 59, {})
    hours = _expand_field(hour, 0, 23, {})
    doms = _expand_field(dom, 1, 31, {})
    months = _expand_field(month, 1, 12, _MONTH_NAMES)
    dows = _expand_field(dow, 1, 7, _DOW_NAMES)

    fires: list[datetime] = []
    cursor = start
    end = start + timedelta(weeks=weeks)
    while cursor < end:
        # AWS numbers day-of-week 1=Sunday..7=Saturday; Python 0=Monday.
        aws_dow = (cursor.weekday() + 1) % 7 + 1
        if (
            (minutes is None or cursor.minute in minutes)
            and (hours is None or cursor.hour in hours)
            and (doms is None or cursor.day in doms)
            and (months is None or cursor.month in months)
            and (dows is None or aws_dow in dows)
        ):
            fires.append(cursor)
        cursor += timedelta(minutes=1)
    return fires


def max_gap_seconds(expression: str) -> int:
    """The longest interval, in seconds, between two consecutive firings."""
    expression = expression.strip()
    rate = re.fullmatch(
        r"rate\((\d+)\s+(minute|minutes|hour|hours|day|days)\)", expression
    )
    if rate:
        amount = int(rate.group(1))
        unit = rate.group(2).rstrip("s")
        return amount * {"minute": 60, "hour": 3600, "day": 86400}[unit]

    cron = re.fullmatch(r"cron\((.*)\)", expression)
    if not cron:
        raise ValueError(f"unrecognised schedule expression: {expression!r}")

    # Ten weeks starting on a Sunday covers every weekday/weekend and
    # month-boundary shape these rules use.
    start = datetime(2026, 1, 4, tzinfo=timezone.utc)
    fires = cron_fire_times(cron.group(1), start, weeks=10)
    if len(fires) < 2:
        raise ValueError(f"schedule fires fewer than twice in 10 weeks: {expression!r}")
    return max(
        int((later - earlier).total_seconds()) for earlier, later in pairwise(fires)
    )


# ── Template model ───────────────────────────────────────────────────────────


@dataclass
class Finding:
    template: str
    alarm: str
    message: str


@dataclass
class Report:
    findings: list[Finding] = field(default_factory=list)
    checked: int = 0

    def fail(self, template: str, alarm: str, message: str) -> None:
        self.findings.append(Finding(template, alarm, message))


def resource_of_type(resources: dict, wanted: set[str]) -> dict[str, dict]:
    return {
        name: body
        for name, body in resources.items()
        if isinstance(body, dict) and body.get("Type") in wanted
    }


def resolve_number(value: object, parameters: dict) -> float | None:
    """Resolve a numeric property that may be a literal or !Ref to a parameter."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, Intrinsic) and value.tag == "Ref":
        default = parameters.get(value.value, {}).get("Default")
        if isinstance(default, (int, float)):
            return float(default)
    return None


def resolve_string(value: object, parameters: dict) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, Intrinsic) and value.tag == "Ref":
        default = parameters.get(value.value, {}).get("Default")
        if isinstance(default, str):
            return default
    return None


def identity_target(
    dimension_value: object, resources: dict, wanted: set[str]
) -> str | None:
    """The logical id this dimension names, or None if it names nothing real."""
    if isinstance(dimension_value, Intrinsic):
        if dimension_value.tag == "Ref":
            name = dimension_value.value
            if resources.get(name, {}).get("Type") in wanted:
                return str(name)
            return None
        if dimension_value.tag == "GetAtt":
            raw = dimension_value.value
            parts = raw.split(".") if isinstance(raw, str) else list(raw)
            name = parts[0]
            if resources.get(name, {}).get("Type") in wanted:
                return str(name)
            return None
        if dimension_value.tag == "Sub":
            # A hand-built name. Match it against every explicit FunctionName /
            # QueueName in the template; anything else is a guess.
            pattern = dimension_value.value
            if not isinstance(pattern, str):
                return None
            for name, body in resources.items():
                if body.get("Type") not in wanted:
                    continue
                props = body.get("Properties", {})
                for key in ("FunctionName", "QueueName", "Name"):
                    declared = props.get(key)
                    if (
                        isinstance(declared, Intrinsic)
                        and declared.tag == "Sub"
                        and declared.value == pattern
                    ):
                        return str(name)
            return None
    return None


def schedule_for_function(
    logical_id: str, resources: dict, parameters: dict
) -> str | None:
    """The schedule expression of the EventBridge rule targeting this function."""
    for body in resources.values():
        if body.get("Type") != "AWS::Events::Rule":
            continue
        props = body.get("Properties", {})
        for target in props.get("Targets", []) or []:
            arn = target.get("Arn")
            if (
                isinstance(arn, Intrinsic)
                and arn.tag == "GetAtt"
                and str(arn.value).split(".")[0] == logical_id
            ):
                return resolve_string(props.get("ScheduleExpression"), parameters)
    return None


def stage_for_api(api_logical_id: str, stage_name: str, resources: dict) -> dict | None:
    """The stage resource for this (ApiId, Stage) dimension pair, if declared."""
    for body in resources.values():
        if body.get("Type") != "AWS::ApiGatewayV2::Stage":
            continue
        props = body.get("Properties", {})
        api = props.get("ApiId")
        if not (
            isinstance(api, Intrinsic)
            and api.tag == "Ref"
            and api.value == api_logical_id
        ):
            continue
        if str(props.get("StageName")) == str(stage_name):
            return props
    return None


def api_count_ceiling(stage_props: dict, period: int, parameters: dict) -> float | None:
    """Most requests the stage can serve in one period, from its own throttle.

    The stage caps throughput at ThrottlingRateLimit requests/second with a
    ThrottlingBurstLimit allowance, so no count metric over that stage can
    exceed rate x period + burst. A threshold at or above that can never be
    crossed however broken the API gets.
    """
    settings = stage_props.get("DefaultRouteSettings") or {}
    rate = resolve_number(settings.get("ThrottlingRateLimit"), parameters)
    burst = resolve_number(settings.get("ThrottlingBurstLimit"), parameters) or 0
    if rate is None:
        return None
    return rate * period + burst


def async_retry_attempts(function_props: dict) -> int:
    """Extra invocations Lambda's async retry policy can add per trigger."""
    config = function_props.get("EventInvokeConfig") or {}
    attempts = config.get("MaximumRetryAttempts")
    return int(attempts) if isinstance(attempts, int) else 2  # Lambda's default


def scheduled_count_ceiling(
    function_props: dict, expression: str, period: int
) -> float | None:
    """Most invocations a scheduled function can record in one period.

    A rule firing every `gap` seconds triggers at most floor(period/gap) + 1
    times inside any window of `period` seconds, and each trigger can produce
    up to 1 + MaximumRetryAttempts invocations. Any per-invocation count metric
    -- Errors, Throttles, Invocations -- is bounded by that product. It is what
    makes the API's "> 10 errors in 5 minutes" threshold unreachable on a
    function that runs once a week.
    """
    gap = max_gap_seconds(expression)
    triggers = period // gap + 1
    return triggers * (1 + async_retry_attempts(function_props))


def check_template(path: Path, report: Report) -> None:
    template = load_template(path)
    resources = template.get("Resources", {})
    parameters = template.get("Parameters", {})
    label = str(path)

    functions = resource_of_type(resources, {"AWS::Serverless::Function"})
    alarms = resource_of_type(resources, {"AWS::CloudWatch::Alarm"})
    queues = resource_of_type(resources, {"AWS::SQS::Queue"})
    topics = resource_of_type(resources, {"AWS::SNS::Topic"})

    # Which functions each alarm watches, keyed by metric name.
    watched: dict[tuple[str, str], list[str]] = {}

    for alarm_name, alarm in sorted(alarms.items()):
        report.checked += 1
        props = alarm.get("Properties", {})
        namespace = props.get("Namespace")
        metric = props.get("MetricName")
        period = props.get("Period")
        evaluation_periods = props.get("EvaluationPeriods")
        datapoints = props.get("DatapointsToAlarm", evaluation_periods)
        threshold = props.get("Threshold")
        operator = props.get("ComparisonOperator")
        dimensions = {
            d.get("Name"): d.get("Value") for d in props.get("Dimensions", []) or []
        }

        # 0. Notifies somebody.
        actions = props.get("AlarmActions") or []
        if not actions:
            report.fail(label, alarm_name, "has no AlarmActions - it notifies nobody")
        for action in actions:
            if not (
                isinstance(action, Intrinsic)
                and action.tag == "Ref"
                and action.value in topics
            ):
                report.fail(
                    label,
                    alarm_name,
                    f"AlarmActions entry {action!r} is not an SNS topic in this template",
                )

        # 1. The metric name is one AWS actually publishes.
        #
        # CloudFormation validates nothing here: `Duratoin`, `5XX` and
        # `FailedInvokations` all deploy cleanly and produce an alarm that
        # never receives a datapoint. This is the only check that catches it
        # for a metric outside the Errors/Throttles/Invocations coverage rules.
        spec = KNOWN_METRICS.get((namespace, metric))
        if spec is None:
            near = sorted(
                m
                for (ns, m) in KNOWN_METRICS
                if ns == namespace and m.lower() == str(metric).lower()
            )
            hint = f" - did you mean {near[0]!r}?" if near else ""
            report.fail(
                label,
                alarm_name,
                f"{metric!r} is not a known metric in namespace {namespace!r}{hint} - "
                "CloudFormation accepts any string here, so this alarm would deploy "
                "and sit in INSUFFICIENT_DATA forever",
            )

        # 2. The dimension set names a resource the stack creates, in a
        #    combination AWS publishes.
        identity = IDENTITY_DIMENSION.get(namespace)
        valid_sets = VALID_DIMENSION_SETS.get(namespace, [])
        if valid_sets and frozenset(dimensions) not in valid_sets:
            report.fail(
                label,
                alarm_name,
                f"dimension set {sorted(dimensions)} is not a combination {namespace} "
                f"publishes; expected one of "
                f"{[sorted(s) for s in valid_sets]} - CloudWatch does not aggregate "
                "across dimensions, so a set AWS never emits has no data",
            )
        if identity is None:
            report.fail(label, alarm_name, f"unknown namespace {namespace!r}")
        else:
            dim_name, wanted_types = identity
            if dim_name not in dimensions:
                report.fail(
                    label,
                    alarm_name,
                    f"namespace {namespace} needs a {dim_name} dimension; got {sorted(dimensions)}",
                )
            else:
                target = identity_target(dimensions[dim_name], resources, wanted_types)
                if target is None:
                    report.fail(
                        label,
                        alarm_name,
                        f"{dim_name} dimension {dimensions[dim_name]!r} does not resolve to "
                        f"any {'/'.join(sorted(wanted_types))} in this template - "
                        "the alarm would sit in INSUFFICIENT_DATA forever",
                    )
                elif namespace == "AWS/Lambda":
                    watched.setdefault((target, metric), []).append(alarm_name)
                # The Stage dimension is a literal name, not a reference, so
                # nothing else checks it resolves to a declared stage.
                elif (
                    namespace == "AWS/ApiGateway"
                    and "Stage" in dimensions
                    and stage_for_api(target, dimensions["Stage"], resources) is None
                ):
                    report.fail(
                        label,
                        alarm_name,
                        f"Stage dimension {dimensions['Stage']!r} is not a stage "
                        f"{target} declares - no metric is published under it",
                    )

        # 3. Period and window are legal.
        if not isinstance(period, int) or (period not in (10, 30) and period % 60 != 0):
            report.fail(
                label,
                alarm_name,
                f"Period {period!r} must be 10, 30 or a multiple of 60",
            )
        if not isinstance(evaluation_periods, int) or evaluation_periods < 1:
            report.fail(
                label,
                alarm_name,
                f"EvaluationPeriods {evaluation_periods!r} is not a positive integer",
            )
        if isinstance(period, int) and isinstance(evaluation_periods, int):
            window = period * evaluation_periods
            if window > MAX_EVALUATION_WINDOW_S:
                report.fail(
                    label,
                    alarm_name,
                    f"evaluation window {window}s exceeds CloudWatch's {MAX_EVALUATION_WINDOW_S}s cap "
                    "- CloudFormation would reject this alarm",
                )
        if (
            isinstance(datapoints, int)
            and isinstance(evaluation_periods, int)
            and datapoints > evaluation_periods
        ):
            report.fail(
                label,
                alarm_name,
                f"DatapointsToAlarm {datapoints} exceeds EvaluationPeriods {evaluation_periods}",
            )

        # 4. The comparison is crossable by the metric's range.
        if (
            spec is not None
            and spec.non_negative
            and isinstance(threshold, (int, float))
        ):
            if operator in ("LessThanThreshold",) and threshold <= 0:
                report.fail(
                    label,
                    alarm_name,
                    f"{metric} is never negative, so {operator} {threshold} can never be true",
                )
            if operator in ("LessThanOrEqualToThreshold",) and threshold < 0:
                report.fail(
                    label,
                    alarm_name,
                    f"{metric} is never negative, so {operator} {threshold} can never be true",
                )
            if operator in ("GreaterThanThreshold",) and threshold < 0:
                report.fail(
                    label,
                    alarm_name,
                    f"{metric} is never negative, so {operator} {threshold} is always true",
                )

        # 5. A Duration threshold above the function's timeout is unreachable.
        if namespace == "AWS/Lambda" and metric == "Duration":
            target = identity_target(
                dimensions.get("FunctionName"), resources, {"AWS::Serverless::Function"}
            )
            if target and isinstance(threshold, (int, float)):
                timeout = resolve_number(
                    functions[target].get("Properties", {}).get("Timeout"), parameters
                )
                globals_timeout = (
                    template.get("Globals", {}).get("Function", {}).get("Timeout")
                )
                if timeout is None:
                    timeout = resolve_number(globals_timeout, parameters)
                if timeout is not None and threshold >= timeout * 1000:
                    report.fail(
                        label,
                        alarm_name,
                        f"Duration threshold {threshold}ms is at or above {target}'s "
                        f"{int(timeout)}s timeout, so it can never be crossed",
                    )

        # 5b. An API Gateway count threshold above what the stage's own
        #     throttle allows through in one period is unreachable.
        if (
            namespace == "AWS/ApiGateway"
            and metric in ("4xx", "5xx", "Count")
            and operator in ("GreaterThanThreshold", "GreaterThanOrEqualToThreshold")
            and isinstance(threshold, (int, float))
            and isinstance(period, int)
        ):
            api = identity_target(
                dimensions.get("ApiId"), resources, {"AWS::ApiGatewayV2::Api"}
            )
            stage_props = (
                stage_for_api(api, dimensions.get("Stage"), resources) if api else None
            )
            if stage_props is not None:
                ceiling = api_count_ceiling(stage_props, period, parameters)
                if ceiling is not None and threshold >= ceiling:
                    report.fail(
                        label,
                        alarm_name,
                        f"threshold {threshold} is at or above the {ceiling:.0f} requests the "
                        f"stage's own throttle can pass in {period}s "
                        "(ThrottlingRateLimit x Period + ThrottlingBurstLimit), so it can "
                        "never be crossed",
                    )

        # 5c. A per-invocation count threshold above what a scheduled
        #     function's own cadence can produce in one period is unreachable.
        #     This is the API's "> 10 errors in 5 minutes" pasted onto a weekly
        #     job -- an alarm that reads as coverage and cannot fire.
        if (
            namespace == "AWS/Lambda"
            and metric in ("Errors", "Throttles", "Invocations")
            and operator in ("GreaterThanThreshold", "GreaterThanOrEqualToThreshold")
            and isinstance(threshold, (int, float))
            and isinstance(period, int)
        ):
            target = identity_target(
                dimensions.get("FunctionName"), resources, {"AWS::Serverless::Function"}
            )
            expression = (
                schedule_for_function(target, resources, parameters) if target else None
            )
            if target and expression:
                ceiling = scheduled_count_ceiling(
                    functions[target].get("Properties", {}), expression, period
                )
                if ceiling is not None and threshold >= ceiling:
                    report.fail(
                        label,
                        alarm_name,
                        f"threshold {threshold} is at or above the {ceiling:.0f} {metric} "
                        f"datapoints {target} can produce in {period}s under "
                        f"{expression!r} (including async retries), so it can never be "
                        "crossed",
                    )

        # 6. A per-route API Gateway metric exists only where detailed metrics
        #    are enabled for that route, either at the stage default or by an
        #    explicit RouteSettings override.
        if (
            namespace == "AWS/ApiGateway"
            and frozenset(dimensions) == API_PER_ROUTE_DIMENSIONS
        ):
            api = identity_target(
                dimensions.get("ApiId"), resources, {"AWS::ApiGatewayV2::Api"}
            )
            stage_props = (
                stage_for_api(api, dimensions.get("Stage"), resources) if api else None
            )
            if stage_props is not None:
                route_key = f"{dimensions.get('Method')} {dimensions.get('Resource')}"
                default_on = (stage_props.get("DefaultRouteSettings") or {}).get(
                    "DetailedMetricsEnabled"
                )
                route_on = (
                    (stage_props.get("RouteSettings") or {}).get(route_key) or {}
                ).get("DetailedMetricsEnabled")
                # An !If or !Ref default is not a decidable `true`; only an
                # explicit per-route override counts in that case.
                if route_on is not True and default_on is not True:
                    report.fail(
                        label,
                        alarm_name,
                        f"per-route dimensions for {route_key!r} need "
                        "DetailedMetricsEnabled on that route, and the stage neither "
                        "enables it by default nor overrides it for this route - the "
                        "metric is never published",
                    )

        # 7. A low-watermark Invocations alarm must outlast the schedule gap.
        if (
            namespace == "AWS/Lambda"
            and metric == "Invocations"
            and operator in ("LessThanThreshold", "LessThanOrEqualToThreshold")
        ):
            target = identity_target(
                dimensions.get("FunctionName"), resources, {"AWS::Serverless::Function"}
            )
            if target:
                expression = schedule_for_function(target, resources, parameters)
                if expression is None:
                    report.fail(
                        label,
                        alarm_name,
                        f"{target} has no EventBridge schedule, so a low-Invocations alarm "
                        "has no cadence to be sized against",
                    )
                elif isinstance(period, int) and isinstance(datapoints, int):
                    gap = max_gap_seconds(expression)
                    # Between two correct runs the gap spans ceil(gap/period)
                    # buckets, exactly one of which holds an invocation, so at
                    # most ceil(gap/period) - 1 consecutive buckets are
                    # legitimately empty. The alarm must need at least one more
                    # than that, or steady-state operation trips it.
                    spanned = -(-gap // period)
                    required = spanned
                    if datapoints < required:
                        report.fail(
                            label,
                            alarm_name,
                            f"needs {datapoints} consecutive empty {period}s buckets, but "
                            f"{target}'s schedule {expression!r} leaves up to {spanned - 1} of "
                            f"them empty between correct runs - this alarm would fire while the "
                            f"schedule is working correctly (needs DatapointsToAlarm >= {required})",
                        )
                    else:
                        margin = (datapoints - required) * period
                        print(
                            f"  note {alarm_name}: {datapoints} x {period}s window vs a "
                            f"{gap}s schedule gap, {margin}s of margin"
                        )

    # 8. Coverage: every function has Errors and Throttles.
    for function_name in sorted(functions):
        for metric in ("Errors", "Throttles"):
            if not watched.get((function_name, metric)):
                report.fail(
                    label,
                    function_name,
                    f"no {metric} alarm watches this function",
                )

    # 9. Coverage: every scheduled function either has a low-Invocations alarm
    #    or a gap that genuinely cannot be expressed inside CloudWatch's cap.
    for function_name in sorted(functions):
        expression = schedule_for_function(function_name, resources, parameters)
        if expression is None:
            continue
        has_low = any(
            alarm_name
            for alarm_name in watched.get((function_name, "Invocations"), [])
            if alarms[alarm_name]["Properties"].get("ComparisonOperator")
            in ("LessThanThreshold", "LessThanOrEqualToThreshold")
        )
        if has_low:
            continue
        gap = max_gap_seconds(expression)
        if gap <= MAX_EVALUATION_WINDOW_S:
            report.fail(
                label,
                function_name,
                f"scheduled {expression!r} with a longest gap of {gap}s, which fits inside "
                f"the {MAX_EVALUATION_WINDOW_S}s cap, but has no low-Invocations alarm",
            )

    # 10. Coverage: every scheduled rule has an EventBridge failure-to-invoke
    #     alarm. A delivery EventBridge could not make produces no Lambda
    #     datapoint at all, so no Errors alarm can see it.
    alarmed_rules = set()
    for alarm in alarms.values():
        props = alarm.get("Properties", {})
        if (
            props.get("Namespace") != "AWS/Events"
            or props.get("MetricName") != "FailedInvocations"
        ):
            continue
        for dimension in props.get("Dimensions", []) or []:
            if dimension.get("Name") == "RuleName":
                target = identity_target(
                    dimension.get("Value"), resources, {"AWS::Events::Rule"}
                )
                if target:
                    alarmed_rules.add(target)
    for rule_name, body in sorted(
        resource_of_type(resources, {"AWS::Events::Rule"}).items()
    ):
        if not body.get("Properties", {}).get("ScheduleExpression"):
            continue
        if rule_name not in alarmed_rules:
            report.fail(
                label,
                rule_name,
                "is a scheduled rule with no AWS/Events FailedInvocations alarm - a delivery "
                "EventBridge cannot make produces no Lambda metric at all",
            )

    # 11. Coverage: every dead-letter queue has a depth alarm.
    dlq_targets: set[str] = set()
    for body in queues.values():
        redrive = body.get("Properties", {}).get("RedrivePolicy") or {}
        arn = redrive.get("deadLetterTargetArn")
        if isinstance(arn, Intrinsic) and arn.tag == "GetAtt":
            dlq_targets.add(str(arn.value).split(".")[0])
    alarmed_queues = set()
    for alarm in alarms.values():
        props = alarm.get("Properties", {})
        if props.get("Namespace") != "AWS/SQS":
            continue
        for dimension in props.get("Dimensions", []) or []:
            if dimension.get("Name") == "QueueName":
                target = identity_target(
                    dimension.get("Value"), resources, {"AWS::SQS::Queue"}
                )
                if target:
                    alarmed_queues.add(target)
    for queue in sorted(dlq_targets - alarmed_queues):
        report.fail(label, queue, "is a dead-letter queue with no depth alarm")


def main(argv: list[str]) -> int:
    if argv:
        paths = [Path(p) for p in argv]
    else:
        paths = [Path("backend/template.yaml")]
        overlay = Path(".sync/overlays/backend/template.yaml")
        if overlay.exists():
            paths.append(overlay)

    report = Report()
    for path in paths:
        if not path.exists():
            print(f"ERROR: {path} does not exist", file=sys.stderr)
            return 1
        check_template(path, report)

    print(
        f"Checked {report.checked} CloudWatch alarms across {len(paths)} template(s)."
    )
    if report.findings:
        print()
        for finding in report.findings:
            print(f"  FAIL {finding.template} :: {finding.alarm}: {finding.message}")
        print()
        print(f"{len(report.findings)} problem(s) found.")
        return 1
    print("Every alarm resolves to a real resource and can be crossed.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
