type Props = {
  message: string;
};

export default function Alert({ message }: Props) {
  if (!message) return null;

  return (
    <div className="bg-red-100 text-red-700 text-sm p-3 rounded-xl">
      {message}
    </div>
  );
}