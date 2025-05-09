{{/* Expand the name of the chart */}}
{{- define "event-ui.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Create a default fully qualified app name */}}
{{- define "event-ui.fullname" -}}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s" $name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Create chart name and version as used by the chart label */}}
{{- define "event-ui.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Common labels */}}
{{- define "event-ui.labels" -}}
helm.sh/chart: {{ include "event-ui.chart" . }}
{{ include "event-ui.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/* Selector labels */}}
{{- define "event-ui.selectorLabels" -}}
app.kubernetes.io/name: {{ include "event-ui.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* Create the name of the service account to use */}}
{{- define "event-ui.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
    {{- default (include "event-ui.fullname" .) .Values.serviceAccount.name }}
    {{- else }}
        {{- default "default" .Values.serviceAccount.name }}
    {{- end }}
{{- end }}
